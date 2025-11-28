import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { Config } from "./config";
import { DataBaseConstruct } from "./rds";
import { ParamStore } from "./constructs/param-store";
import { ImportedVpc } from "./constructs/imported-vpc";

export interface HyperswitchDatabaseStackProps extends cdk.StackProps {
  config: Config;
}

export class HyperswitchDatabaseStack extends cdk.Stack {
  public readonly rds: DataBaseConstruct;
  public readonly vpc: ec2.IVpc;

  constructor(scope: Construct, id: string, props: HyperswitchDatabaseStackProps) {
    super(scope, id, props);

    const { config } = props;

    cdk.Tags.of(this).add("Stack", "Hyperswitch-Database");
    cdk.Tags.of(this).add("StackName", `${config.stack.name}-database`);

    Object.entries(config.tags).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value);
    });

    // Import VPC from SSM parameters (created by VpcStack)
    // Uses public subnets only for minimal cost (no NAT Gateway)
    this.vpc = ImportedVpc.FromSSM(this, {
      maxAzs: config.vpc.maxAzs,
      includePrivateSubnets: false,
      includePrivateSubnetRouteTables: false,
      includePrivateSubnetCidrs: false,
      includeIsolatedSubnets: false,
      includeIsolatedSubnetRouteTables: false,
      includeIsolatedSubnetCidrs: false
    });

    // Create RDS database
    // Configuration values (subnetType, publiclyAccessible) come from awsconfig.ts
    this.rds = new DataBaseConstruct(this, config.rds, this.vpc);

    // Allow traffic from VPC to RDS
    this.rds.sg.addIngressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.tcp(5432),
      'Allow PostgreSQL from VPC'
    );

    // Export RDS information to SSM for migration stack
    const dbSecretArn = this.rds.db.secret!.secretArn;
    const rdsParams = ParamStore.hyperswitchRds();

    new ssm.StringParameter(this, "DbEndpointParam", {
      parameterName: rdsParams.SSM_RDS_ENDPOINT_PARAM.value,
      stringValue: this.rds.db.instanceEndpoint.hostname,
      description: "RDS database endpoint hostname"
    });

    new ssm.StringParameter(this, "DbSecretArnParam", {
      parameterName: rdsParams.SSM_RDS_SECRET_ARN_PARAM.value,
      stringValue: dbSecretArn,
      description: "RDS database secret ARN"
    });

    new ssm.StringParameter(this, "DbSecurityGroupIdParam", {
      parameterName: rdsParams.SSM_RDS_SG_ID_PARAM.value,
      stringValue: this.rds.sg.securityGroupId,
      description: "RDS database security group ID"
    });
  }
}
