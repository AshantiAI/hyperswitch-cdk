import * as ec2 from "aws-cdk-lib/aws-ec2";
import { RemovalPolicy } from "aws-cdk-lib";
import {
  ISecurityGroup,
  InstanceType,
  Port,
  SecurityGroup,
  IVpc,
  SubnetType,
  InstanceClass,
  InstanceSize
} from "aws-cdk-lib/aws-ec2";
import {
  Credentials,
  DatabaseInstance,
  DatabaseInstanceEngine,
  PostgresEngineVersion,
} from "aws-cdk-lib/aws-rds";
import { Construct } from "constructs";
import { RDSConfig } from "./config";

export class DataBaseConstruct {
  sg: SecurityGroup;
  db: DatabaseInstance;
  password: string;

  constructor(scope: Construct, rds_config: RDSConfig, vpc: IVpc) {
    const db_security_group = new SecurityGroup(scope, "Hyperswitch-db-SG", {
      securityGroupName: "Hyperswitch-db-SG",
      vpc: vpc,
    });

    this.password = rds_config.password;
    this.sg = db_security_group;

    // IMPORTANT: Using PUBLIC subnets for cost-saving purposes only (no NAT Gateway)
    // For production environments, use PRIVATE_WITH_EGRESS or PRIVATE_ISOLATED
    const subnetType = rds_config.subnetType || SubnetType.PRIVATE_ISOLATED;

    // Determine if RDS should be publicly accessible
    // Default behavior: true for PUBLIC subnets, false otherwise
    const publiclyAccessible = rds_config.publiclyAccessible ?? (subnetType === SubnetType.PUBLIC);

    // DatabaseInstance automatically creates and manages a secret
    // Secret will contain: username, password, host, port, dbname, engine
    this.db = new DatabaseInstance(scope, "hyperswitch-db", {
      engine: DatabaseInstanceEngine.postgres({
        version: PostgresEngineVersion.VER_14,
      }),
      instanceType: InstanceType.of(
        InstanceClass.T3,
        InstanceSize.MICRO
      ),
      vpc,
      vpcSubnets: { subnetType },
      securityGroups: [this.sg],
      databaseName: rds_config.db_name,
      credentials: Credentials.fromGeneratedSecret(rds_config.db_user, {
        secretName: "hyperswitch-db-credentials",
      }),
      port: rds_config.port,
      // IMPORTANT: Make RDS publicly accessible when in public subnets
      // This allows Lambda in public subnets to connect without NAT Gateway
      publiclyAccessible,
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }

  addClient(
    peer: ISecurityGroup,
    port: number,
    description?: string,
    remote_rule?: boolean
  ) {
    this.sg.addIngressRule(peer, Port.tcp(port), description, remote_rule);
    peer.addEgressRule(this.sg, Port.tcp(port), description, remote_rule);
  }
}