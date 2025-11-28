import * as cdk from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as cr from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
import { DockerImageAsset, Platform } from "aws-cdk-lib/aws-ecr-assets";
import * as path from "path";
import { ParamStore } from "./constructs/param-store";
import { ImportedVpc } from "./constructs/imported-vpc";
import { Config } from "./config";

export interface HyperswitchMigrationStackProps extends cdk.StackProps {
  readonly config: Config;
  readonly useVpc: boolean;
}

export class HyperswitchMigrationStack extends cdk.Stack {
  public readonly migrationFunction: lambda.DockerImageFunction;
  public readonly repository: ecr.Repository;

  constructor(scope: Construct, id: string, props: HyperswitchMigrationStackProps) {
    super(scope, id, props);

    const { config, useVpc } = props;

    // Import VPC only if Lambda will be in VPC (when RDS is in private subnets)
    let vpc: ec2.IVpc | undefined;
    if (useVpc) {
      vpc = ImportedVpc.FromSSM(this, {
        maxAzs: config.vpc.maxAzs,
        includePrivateSubnets: false,
        includePrivateSubnetRouteTables: false,
        includePrivateSubnetCidrs: false,
        includeIsolatedSubnets: false,
        includeIsolatedSubnetRouteTables: false,
        includeIsolatedSubnetCidrs: false
      });
    }

    // Read database information from SSM parameters
    const rdsParams = ParamStore.hyperswitchRds();
    const dbSecretArn = ssm.StringParameter.valueForStringParameter(
      this,
      rdsParams.SSM_RDS_SECRET_ARN_PARAM.value
    );

    const dbSecret = secretsmanager.Secret.fromSecretCompleteArn(
      this,
      "ImportedDbSecret",
      dbSecretArn
    );

    // Import DB security group only if Lambda is in VPC
    let dbSecurityGroup: ec2.ISecurityGroup | undefined;
    if (useVpc) {
      const dbSgId = ssm.StringParameter.valueForStringParameter(
        this,
        rdsParams.SSM_RDS_SG_ID_PARAM.value
      );

      dbSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
        this,
        "ImportedDbSG",
        dbSgId
      );
    }

    const repositoryName = "juspaydotin/hyperswitch-migration2";

    // Create ECR repository for migration-runner image
    this.repository = new ecr.Repository(this, "MigrationRunnerRepository", {
      repositoryName,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
      imageScanOnPush: true,
      lifecycleRules: [
        {
          description: "Keep last 5 images",
          maxImageCount: 5,
        },
      ],
    });

    // Build Docker image with Diesel CLI and migrations
    // Use project root as build context to access node_modules
    const migrationImage = new DockerImageAsset(this, "MigrationRunnerImage", {
      directory: path.join(__dirname, "..", ".."),
      file: "lib/aws/migrations/migration-runner.Dockerfile",
      buildArgs: {
        HYPERSWITCH_VERSION: config.versions.hyperswitch_router,
      },
      platform: Platform.LINUX_AMD64,
    });

    // Create Lambda security group only if using VPC
    let lambdaSecurityGroup: ec2.SecurityGroup | undefined;
    if (useVpc && vpc && dbSecurityGroup) {
      lambdaSecurityGroup = new ec2.SecurityGroup(this, "MigrationLambdaSG", {
        vpc: vpc as ec2.IVpc,
        description: "Security group for migration Lambda function",
        allowAllOutbound: true,
      });

      // Allow Lambda to connect to database within VPC
      (dbSecurityGroup as ec2.ISecurityGroup).addIngressRule(
        lambdaSecurityGroup,
        ec2.Port.tcp(5432),
        "Allow migration Lambda to access database"
      );
    }

    // Create Lambda function using the Docker image
    // VPC configuration is conditional based on whether Lambda should be in VPC
    const lambdaConfigBase = {
      code: lambda.DockerImageCode.fromEcr(migrationImage.repository, {
        tagOrDigest: migrationImage.imageTag,
      }),
      timeout: cdk.Duration.minutes(15),
      memorySize: 512,
      architecture: lambda.Architecture.X86_64,
      environment: {
        HYPERSWITCH_VERSION: config.versions.hyperswitch_router,
        DB_SECRET_ARN: dbSecretArn,
      },
      description: `Hyperswitch database migration runner for ${config.versions.hyperswitch_router}`,
    };

    // Add VPC configuration conditionally
    const lambdaConfig: lambda.DockerImageFunctionProps = useVpc && vpc && lambdaSecurityGroup
      ? {
        ...lambdaConfigBase,
        vpc,
        vpcSubnets: { subnetType: config.rds.subnetType },
        securityGroups: [lambdaSecurityGroup],
        ...(config.rds.subnetType === ec2.SubnetType.PUBLIC ? { allowPublicSubnet: true } : {})
      }
      : lambdaConfigBase;

    this.migrationFunction = new lambda.DockerImageFunction(this, "MigrationFunction", lambdaConfig);

    // Grant Lambda permissions to read database credentials
    dbSecret.grantRead(this.migrationFunction);

    // Grant Lambda permissions to pull from ECR
    this.repository.grantPull(this.migrationFunction);

    // Add CloudWatch Logs permissions
    this.migrationFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ],
        resources: ["*"],
      })
    );

    // Create Provider for CustomResource (CDK best practice)
    // Provider handles CloudFormation protocol and manages Lambda invocations
    const migrationProvider = new cr.Provider(this, "MigrationProvider", {
      onEventHandler: this.migrationFunction,
      logRetention: 7, // Keep CloudWatch logs for 7 days
    });

    // Create CustomResource to trigger migrations on stack CREATE and UPDATE
    // CloudFormation will invoke the Lambda when:
    // - Stack is created (RequestType: Create)
    // - HyperswitchVersion property changes (RequestType: Update)
    // - Stack is deleted (RequestType: Delete - Lambda handles gracefully)
    // Note: Changed logical ID from "MigrationTrigger" to "MigrationTriggerV2" to force replacement
    // when switching from direct Lambda invocation to Provider pattern
    const migrationTrigger = new cdk.CustomResource(this, "MigrationTriggerV2", {
      serviceToken: migrationProvider.serviceToken,
      properties: {
        HyperswitchVersion: config.versions.hyperswitch_router,
        DbSecretArn: dbSecretArn,
      },
    });

    // Export repository information to SSM for cross-stack imports
    const paramStore = ParamStore.ecr(repositoryName);

    new ssm.StringParameter(this, "RepositoryUriParam", {
      parameterName: paramStore.SSM_ECR_URI_PARAM.value,
      stringValue: this.repository.repositoryUri,
      description: `ECR repository URI for ${repositoryName}`,
    });

    new ssm.StringParameter(this, "RepositoryArnParam", {
      parameterName: paramStore.SSM_ECR_ARN_PARAM.value,
      stringValue: this.repository.repositoryArn,
      description: `ECR repository ARN for ${repositoryName}`,
    });

    new ssm.StringParameter(this, "RepositoryNameParam", {
      parameterName: paramStore.SSM_ECR_NAME_PARAM.value,
      stringValue: this.repository.repositoryName,
      description: `ECR repository name for ${repositoryName}`,
    });

    // Export Lambda function ARN to SSM for app stack
    const migrationParams = ParamStore.hyperswitchMigration('tmp1');

    new ssm.StringParameter(this, "MigrationFunctionArnParam", {
      parameterName: migrationParams.SSM_FUNCTION_ARN_PARAM.value,
      stringValue: this.migrationFunction.functionArn,
      description: "Migration Lambda function ARN",
    });
  }
}
