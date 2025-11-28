import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { Config, EC2Config } from "./config";
import { SecurityGroups } from "./security_groups";
import { EC2Instance } from "./ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3_assets from "aws-cdk-lib/aws-s3-assets";
import { readFileSync } from "fs";
import { ParamStore } from "./constructs/param-store";
import { ImportedVpc } from "./constructs/imported-vpc";

export class HyperswitchAppStack extends cdk.Stack {

    constructor(scope: Construct, config: Config) {
        super(scope, `${config.stack.name}-app`, {
            env: {
                account: process.env.CDK_DEFAULT_ACCOUNT,
                region: process.env.CDK_DEFAULT_REGION
            },
            stackName: `${config.stack.name}-app`,
        });

        cdk.Tags.of(this).add("Stack", "Hyperswitch-Application");
        cdk.Tags.of(this).add("StackName", `${config.stack.name}-app`);

        Object.entries(config.tags).forEach(([key, value]) => {
            cdk.Tags.of(this).add(key, value);
        });

        // Import VPC from SSM parameters (created by VpcStack)
        // Uses public subnets only for minimal cost (no NAT Gateway)
        const vpc = ImportedVpc.FromSSM(this, {
            maxAzs: config.vpc.maxAzs,
            includePrivateSubnets: false,
            includePrivateSubnetRouteTables: false,
            includePrivateSubnetCidrs: false,
            includeIsolatedSubnets: false,
            includeIsolatedSubnetRouteTables: false,
            includeIsolatedSubnetCidrs: false
        });

        // Read database information from SSM
        const rdsParams = ParamStore.hyperswitchRds();
        const dbEndpoint = ssm.StringParameter.valueForStringParameter(
            this,
            rdsParams.SSM_RDS_ENDPOINT_PARAM.value
        );

        const dbSgId = ssm.StringParameter.valueForStringParameter(
            this,
            rdsParams.SSM_RDS_SG_ID_PARAM.value
        );

        const dbSecretArn = ssm.StringParameter.valueForStringParameter(
            this,
            rdsParams.SSM_RDS_SECRET_ARN_PARAM.value
        );

        // Read ElastiCache information from SSM
        const elasticacheParams = ParamStore.hyperswitchElasticache();
        const redisEndpoint = ssm.StringParameter.valueForStringParameter(
            this,
            elasticacheParams.SSM_ELASTICACHE_ENDPOINT_PARAM.value
        );

        const elasticacheSgId = ssm.StringParameter.valueForStringParameter(
            this,
            elasticacheParams.SSM_ELASTICACHE_SG_ID_PARAM.value
        );

        // Import security groups
        const dbSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
            this,
            "ImportedDbSG",
            dbSgId
        );

        const elasticacheSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
            this,
            "ImportedElastiCacheSG",
            elasticacheSgId
        );

        // Update config with database and redis endpoints
        config = update_hosts_standalone(
            config,
            dbEndpoint,
            redisEndpoint
        );

        // Create SecurityGroups for standalone mode
        const securityGroups = new SecurityGroups(this, 'HyperswitchSecurityGroups', {
            vpc: vpc,
            isStandalone: true,
        });

        const ec2Sg = securityGroups.ec2SecurityGroup!;
        const appAlbSg = securityGroups.appAlbSecurityGroup!;

        const appAlb = new elbv2.ApplicationLoadBalancer(this, 'AppALB', {
            vpc: vpc,
            internetFacing: true,
            securityGroup: appAlbSg,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PUBLIC,
                onePerAz: true
            },
        });

        const sdkAlbSg = securityGroups.sdkAlbSecurityGroup!;

        const sdkAlb = new elbv2.ApplicationLoadBalancer(this, 'SdkALB', {
            vpc: vpc,
            internetFacing: true,
            securityGroup: sdkAlbSg,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PUBLIC,
                onePerAz: true
            },
        });

        config.hyperswitch_ec2.app_alb_dns = appAlb.loadBalancerDnsName;
        config.hyperswitch_ec2.sdk_alb_dns = sdkAlb.loadBalancerDnsName;

        const appAlb80Distribution = new cloudfront.Distribution(this, 'StandaloneDistribution', {
            defaultBehavior: {
                origin: new origins.HttpOrigin(appAlb.loadBalancerDnsName, {
                    protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
                }),
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.ALLOW_ALL,
                originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
                allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
                cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
            },
        });

        const appAlb9000Distribution = new cloudfront.Distribution(this, 'ControlCenterDistribution', {
            defaultBehavior: {
                origin: new origins.HttpOrigin(appAlb.loadBalancerDnsName, {
                    protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
                    httpPort: 9000,
                }),
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.ALLOW_ALL,
                originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
                allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
                cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
            },
        });

        const sdkAlb9090Distribution = new cloudfront.Distribution(this, 'SdkAssetsDistribution', {
            defaultBehavior: {
                origin: new origins.HttpOrigin(sdkAlb.loadBalancerDnsName, {
                    protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
                    httpPort: 9090,
                }),
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.ALLOW_ALL,
                originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
                allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
                cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
            },
        });

        const appCloudFrontUrl = appAlb80Distribution.distributionDomainName;
        const controlCenterCloudFrontUrl = appAlb9000Distribution.distributionDomainName;
        const sdkCloudFrontUrl = sdkAlb9090Distribution.distributionDomainName;

        const ec2Role = new iam.Role(this, 'HyperswitchEC2Role', {
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
                iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
                iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3ReadOnlyAccess')
            ]
        });

        ec2Role.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'ssm:UpdateInstanceInformation',
                'ssmmessages:CreateControlChannel',
                'ssmmessages:CreateDataChannel',
                'ssmmessages:OpenControlChannel',
                'ssmmessages:OpenDataChannel',
                'ec2messages:AcknowledgeMessage',
                'ec2messages:DeleteMessage',
                'ec2messages:FailMessage',
                'ec2messages:GetEndpoint',
                'ec2messages:GetMessages',
                'ec2messages:SendReply'
            ],
            resources: ['*']
        }));

        ec2Role.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['secretsmanager:GetSecretValue'],
            resources: [dbSecretArn]
        }));

        let hyperswitch_ec2 = new EC2Instance(
            this,
            vpc,
            {
                ...get_standalone_ec2_config(this, config, appCloudFrontUrl, controlCenterCloudFrontUrl, sdkCloudFrontUrl, ec2Role, dbSecretArn),
                role: ec2Role
            }
        );

        // Force instance replacement when needed
        cdk.Tags.of(hyperswitch_ec2.getInstance()).add('DeploymentVersion', '2025-11-26');

        // Add egress rules to EC2 to allow traffic to RDS and ElastiCache
        hyperswitch_ec2.sg.addEgressRule(dbSecurityGroup, ec2.Port.tcp(5432));
        hyperswitch_ec2.sg.addEgressRule(elasticacheSecurityGroup, ec2.Port.tcp(6379));
        hyperswitch_ec2.sg.addIngressRule(
            ec2.Peer.ipv4(vpc.vpcCidrBlock),
            ec2.Port.tcp(80),
        );
        hyperswitch_ec2.sg.addIngressRule(
            ec2.Peer.ipv4(vpc.vpcCidrBlock),
            ec2.Port.tcp(9000),
        );
        hyperswitch_ec2.sg.addIngressRule(
            ec2.Peer.ipv4(vpc.vpcCidrBlock),
            ec2.Port.tcp(80),
        );
        hyperswitch_ec2.sg.addIngressRule(
            ec2.Peer.ipv4(vpc.vpcCidrBlock),
            ec2.Port.tcp(22),
        );

        // Deploying SDK and Demo app in a single EC2 instance
        let hyperswitch_sdk_ec2 = new EC2Instance(
            this,
            vpc,
            {
                ...get_standalone_sdk_ec2_config(config, appCloudFrontUrl, sdkCloudFrontUrl),
                role: ec2Role
            }
        );

        hyperswitch_sdk_ec2.sg.addIngressRule(
            ec2.Peer.ipv4(vpc.vpcCidrBlock),
            ec2.Port.tcp(9090),
        );
        hyperswitch_sdk_ec2.sg.addIngressRule(
            ec2.Peer.ipv4(vpc.vpcCidrBlock),
            ec2.Port.tcp(5252),
        );
        hyperswitch_sdk_ec2.sg.addIngressRule(
            ec2.Peer.ipv4(vpc.vpcCidrBlock),
            ec2.Port.tcp(22),
        );

        // Allow SDK EC2 instance to access the application EC2 instance
        hyperswitch_ec2.sg.addIngressRule(
            hyperswitch_sdk_ec2.sg,
            ec2.Port.tcp(80),
            'Allow SDK instance to access application'
        );

        new ec2.CfnSecurityGroupIngress(this, 'AppAlbIngress', {
            groupId: hyperswitch_ec2.sg.securityGroupId,
            ipProtocol: 'tcp',
            fromPort: 80,
            toPort: 80,
            sourceSecurityGroupId: appAlbSg.securityGroupId,
        });

        new ec2.CfnSecurityGroupIngress(this, 'AppAlbIngress8080', {
            groupId: hyperswitch_ec2.sg.securityGroupId,
            ipProtocol: 'tcp',
            fromPort: 8080,
            toPort: 8080,
            sourceSecurityGroupId: appAlbSg.securityGroupId,
        });

        new ec2.CfnSecurityGroupIngress(this, 'AppAlbIngress9000', {
            groupId: hyperswitch_ec2.sg.securityGroupId,
            ipProtocol: 'tcp',
            fromPort: 9000,
            toPort: 9000,
            sourceSecurityGroupId: appAlbSg.securityGroupId,
        });

        const listener80 = appAlb.addListener('Listener80', { port: 80, protocol: elbv2.ApplicationProtocol.HTTP });
        const target80 = new elbv2.ApplicationTargetGroup(this, 'AppTarget80', {
            vpc: vpc,
            port: 8080,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targetType: elbv2.TargetType.INSTANCE,
            targets: [hyperswitch_ec2],
            healthCheck: {
                path: '/health',
                protocol: elbv2.Protocol.HTTP,
                unhealthyThresholdCount: 10,
                healthyThresholdCount: 2,
                timeout: cdk.Duration.seconds(30),
                interval: cdk.Duration.seconds(60),
                healthyHttpCodes: '200-499'
            }
        });
        listener80.addTargetGroups('AppTargetGroup80', {
            targetGroups: [target80]
        });

        const listener9000 = appAlb.addListener('Listener9000', { port: 9000, protocol: elbv2.ApplicationProtocol.HTTP });
        listener9000.addTargets('AppTarget9000', {
            port: 9000,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targets: [hyperswitch_ec2],
            healthCheck: { path: '/', protocol: elbv2.Protocol.HTTP }
        });

        const sdkListener9090 = sdkAlb.addListener('SdkListener9090', { port: 9090, protocol: elbv2.ApplicationProtocol.HTTP });
        sdkListener9090.addTargets('SdkTarget9090', {
            port: 9090,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targets: [hyperswitch_sdk_ec2],
            healthCheck: { path: '/', protocol: elbv2.Protocol.HTTP }
        });

        const sdkListener5252 = sdkAlb.addListener('SdkListener5252', { port: 5252, protocol: elbv2.ApplicationProtocol.HTTP });
        sdkListener5252.addTargets('SdkTarget5252', {
            port: 5252,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targets: [hyperswitch_sdk_ec2],
            healthCheck: { path: '/', protocol: elbv2.Protocol.HTTP }
        });

        new cdk.CfnOutput(this, "StandaloneURL", {
            value: `https://${appAlb80Distribution.distributionDomainName}/health`,
        });
        new cdk.CfnOutput(this, "ControlCenterURL", {
            value: `https://${appAlb9000Distribution.distributionDomainName}/`,
        });
        new cdk.CfnOutput(this, "SdkAssetsURL", {
            value: `https://${sdkAlb9090Distribution.distributionDomainName}/${config.versions.hyperswitch_web}/${config.versions.hyperswitch_sdk}/HyperLoader.js`,
        });
    }
}

function update_hosts_standalone(config: Config, db_host: string, redis_host: string) {
    config.hyperswitch_ec2.db_host = db_host;
    config.hyperswitch_ec2.redis_host = redis_host;
    return config;
}

function get_standalone_ec2_config(scope: Construct, config: Config, appCloudFrontUrl: string, controlCenterCloudFrontUrl: string, sdkCloudFrontUrl: string, role: iam.Role, dbSecretArn: string) {
    const configAsset = new s3_assets.Asset(scope, "ConfigTomlAsset", {
        path: "lib/aws/config.toml",
    });

    configAsset.grantRead(role);

    // Replace all placeholders - CDK will handle token resolution automatically
    const customData = readFileSync("lib/aws/userdata.sh", "utf8")
        .replaceAll("{{admin_api_key}}", config.hyperswitch_ec2.admin_api_key)
        .replaceAll("{{jwt_secret}}", config.hyperswitch_ec2.jwt_secret)
        .replaceAll("{{master_enc_key}}", config.hyperswitch_ec2.master_enc_key)
        .replaceAll("{{db_username}}", config.rds.db_user)
        .replaceAll("{{db_name}}", config.rds.db_name)
        .replaceAll("{{app_cloudfront_url}}", appCloudFrontUrl)
        .replaceAll("{{control_center_cloudfront_url}}", controlCenterCloudFrontUrl)
        .replaceAll("{{sdk_cloudfront_url}}", sdkCloudFrontUrl)
        .replaceAll("{{version}}", config.versions.hyperswitch_web)
        .replaceAll("{{sub_version}}", config.versions.hyperswitch_sdk)
        .replaceAll("{{hyperswitch_version}}", config.versions.hyperswitch_router)
        .replaceAll("{{control_center_version}}", config.versions.control_center)
        // CDK tokens - these will be resolved by CloudFormation at deploy time
        .replaceAll("{{config_toml_s3_url}}", configAsset.s3ObjectUrl)
        .replaceAll("{{redis_host}}", config.hyperswitch_ec2.redis_host)
        .replaceAll("{{db_host}}", config.hyperswitch_ec2.db_host)
        .replaceAll("{{db_secret_arn}}", dbSecretArn)
        .replaceAll("{{aws_region}}", config.stack.region);

    let ec2_config: EC2Config = {
        id: "hyperswitch_standalone_app_cc_ec2",
        instanceType: ec2.InstanceType.of(
            ec2.InstanceClass.T3,
            ec2.InstanceSize.SMALL,
        ),
        machineImage: new ec2.AmazonLinuxImage({
            generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2023,
        }),
        vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
        userData: ec2.UserData.custom(customData),
        allowOutboundTraffic: true
    };
    return ec2_config;
}

function get_standalone_sdk_ec2_config(config: Config, appCloudFrontUrl: string, sdkCloudFrontUrl: string) {
    let customData = readFileSync("lib/aws/sdk_userdata.sh", "utf8")
        .replaceAll("{{admin_api_key}}", config.hyperswitch_ec2.admin_api_key)
        .replaceAll("{{version}}", config.versions.hyperswitch_web)
        .replaceAll("{{sub_version}}", config.versions.hyperswitch_sdk)
        .replaceAll("{{app_cloudfront_url}}", appCloudFrontUrl || "")
        .replaceAll("{{sdk_cloudfront_url}}", sdkCloudFrontUrl || "");
    let ec2_config: EC2Config = {
        id: "hyperswitch_standalone_sdk_demo_ec2",
        instanceType: ec2.InstanceType.of(
            ec2.InstanceClass.T3,
            ec2.InstanceSize.SMALL,
        ),
        machineImage: new ec2.AmazonLinuxImage({
            generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2023,
        }),
        vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
        userData: ec2.UserData.custom(customData),
        allowOutboundTraffic: true,
    };
    return ec2_config;
}
