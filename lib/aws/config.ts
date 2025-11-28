// import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import { KeymanagerConfig } from "./keymanager/stack"

export enum Environment {
    Integ,
    Sandbox,
    Production,
}

export type StackConfig = {
    name: string;
    region: string;
    environment?: Environment;
};

/**
 * A simplified configuration for setting up VPC
 */
export type VpcConfig = {
    /**
     * Name of the VPC
     */
    name: string;
    /**
     * The number of Availability zones for the VPC.
     * (eg. 2)
     */
    maxAzs: number;
};

/**
 * A simplified configuration for setting up VPC
 */
export type SubnetConfigs = {
    public: SubnetConfig;
    dmz: SubnetConfig;
};

export type SubnetConfig = {
    name: string;
};

export type SSMConfig = {
    log_bucket_name: string;
};

export type ExtraSubnetConfig = {
    id: string;
    cidr: string;
};

export type RDSConfig = {
    port: number;
    password: string;
    db_user: string;
    db_name: string;
    writer_instance_class: ec2.InstanceClass;
    writer_instance_size: ec2.InstanceSize;
    reader_instance_class: ec2.InstanceClass;
    reader_instance_size: ec2.InstanceSize;
    /**
     * Subnet type for RDS deployment
     * IMPORTANT: PUBLIC subnets are for cost-saving purposes only (no NAT Gateway)
     * For production, use PRIVATE_WITH_EGRESS or PRIVATE_ISOLATED
     */
    subnetType?: ec2.SubnetType;
    /**
     * Whether RDS instance should be publicly accessible
     * Required when Lambda in public subnets needs to connect without NAT Gateway
     * Default: true for PUBLIC subnets, false for PRIVATE subnets
     */
    publiclyAccessible?: boolean;
};

export type EC2 = {
    id: string;
    admin_api_key: string;
    jwt_secret: string;
    master_enc_key: string;
    redis_host: string;
    db_host: string;
    app_alb_dns?: string;
    sdk_alb_dns?: string;
};


export type LockerConfig = {
    master_key: string;
    db_pass: string;
    db_user: string;
};

export type Tags = {
    [key: string]: string;
};

export type VersionsConfig = {
    hyperswitch_web: string;
    hyperswitch_sdk: string;
    hyperswitch_router: string;
    control_center: string;
};

export type Config = {
    stack: StackConfig;
    locker: LockerConfig;
    keymanager: KeymanagerConfig;
    vpc: VpcConfig;
    subnet: SubnetConfigs;
    extra_subnets: ExtraSubnetConfig[]; // TODO: remove this if not required
    hyperswitch_ec2: EC2;
    rds: RDSConfig;
    tags: Tags;
    versions: VersionsConfig;
};

export type ImageBuilderConfig = {
    name: string;
    ami_id: string;
    vpc: VpcConfig;
}

export type EC2Config = {
    id: string;   // id of the instance
    machineImage: ec2.IMachineImage;
    instanceType: ec2.InstanceType;
    vpcSubnets: ec2.SubnetSelection;
    securityGroup?: ec2.SecurityGroup;
    keyPair?: ec2.IKeyPair;
    userData?: ec2.UserData;
    ssmSessionPermissions?: boolean;
    associatePublicIpAddress?: boolean;
    allowOutboundTraffic?: boolean;
    role?: iam.IRole;
    app_alb_dns?: string;
    sdk_alb_dns?: string;
}
