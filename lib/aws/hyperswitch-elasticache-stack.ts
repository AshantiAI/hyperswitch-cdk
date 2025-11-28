import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { Config } from "./config";
import { ElasticacheStack } from "./elasticache";
import { ParamStore } from "./constructs/param-store";
import { ImportedVpc } from "./constructs/imported-vpc";

export interface HyperswitchElasticacheStackProps extends cdk.StackProps {
  config: Config;
}

export class HyperswitchElasticacheStack extends cdk.Stack {
  public readonly elasticache: ElasticacheStack;
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props: HyperswitchElasticacheStackProps) {
    super(scope, id, props);

    const { config } = props;

    cdk.Tags.of(this).add("Stack", "Hyperswitch-ElastiCache");
    cdk.Tags.of(this).add("StackName", `${config.stack.name}-elasticache`);

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
    }) as ec2.Vpc;

    // Create ElastiCache Redis cluster
    this.elasticache = new ElasticacheStack(this, config, this.vpc);

    // Allow traffic from VPC to ElastiCache
    this.elasticache.sg.addIngressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.tcp(6379),
      'Allow Redis from VPC'
    );

    // Export ElastiCache information to SSM for app stack
    const elasticacheParams = ParamStore.hyperswitchElasticache();

    new ssm.StringParameter(this, "ElastiCacheEndpointParam", {
      parameterName: elasticacheParams.SSM_ELASTICACHE_ENDPOINT_PARAM.value,
      stringValue: this.elasticache.cluster.attrRedisEndpointAddress,
      description: "ElastiCache Redis endpoint"
    });

    new ssm.StringParameter(this, "ElastiCacheSgIdParam", {
      parameterName: elasticacheParams.SSM_ELASTICACHE_SG_ID_PARAM.value,
      stringValue: this.elasticache.sg.securityGroupId,
      description: "ElastiCache security group ID"
    });

    // Export CloudFormation outputs
    new cdk.CfnOutput(this, 'RedisEndpoint', {
      value: this.elasticache.cluster.attrRedisEndpointAddress,
      exportName: `${config.stack.name}-RedisEndpoint`,
      description: "ElastiCache Redis endpoint",
    });
  }
}
