
import { capitalize } from './strings';
import { IConstruct } from 'constructs';

export class ParamStore {

  // Public static methods
  public static create(...params: string[]): ParamStore {
    return new ParamStore("ashanti", ...params);
  }

  public static createWithEnv(env: string, ...params: string[]): ParamStore {
    return new ParamStore("ashanti", env, ...params);
  }


  // EKS static parameter methods
  public static eksClusterName(): ParamStore {
    return ParamStore.create('eks', 'cluster', 'name');
  }
  public static eksClusterEndpoint(): ParamStore {
    return ParamStore.create('eks', 'cluster', 'endpoint');
  }
  public static eksClusterClusterSgId(): ParamStore {
    return ParamStore.create('eks', 'cluster', 'cluster', 'sg', 'id');
  }
  public static eksClusterOpenIdConnectProviderArn(): ParamStore {
    return ParamStore.create('eks', 'cluster', 'openIdConnectProvider', 'arn');
  }
  public static eksClusterKubectlProviderServiceToken(): ParamStore {
    return ParamStore.create('eks', 'cluster', 'kubectl', 'provider', 'service', 'token');
  }
  public static eksClusterKubectlProviderRoleArn(): ParamStore {
    return ParamStore.create('eks', 'cluster', 'kubectl', 'provider', 'role', 'arn');
  }
  public static eksClusterKubectlLayerArn(): ParamStore {
    return ParamStore.create('eks', 'cluster', 'kubectl', 'layer', 'arn');
  }

  // Instance fields (after all static members)
  public readonly value: string;

  protected constructor(...params: string[]) {
    this.value = this.PARAM_BASE(...params);
  }

  private PARAM_BASE(...keys: string[]): string {
    return '/' + [...keys].filter((key) => !!key).join('/');
  }

  public static ecr(repositoryName: string): EcrParamStore {
    return new EcrParamStore(repositoryName);
  }

  public static vpc(): VpcParamStore {
    return new VpcParamStore();
  }

  public static batch(jobName: string): BatchParamStore {
    return new BatchParamStore(jobName);
  }

  public static hostedZone(hostedZoneName: string): HostedZoneParamStore {
    return new HostedZoneParamStore(hostedZoneName);
  }

  public static certificate(domainName: string): CertificateParamStore {
    return new CertificateParamStore(domainName);
  }

  public static certificateAuthority(authorityName: string): CertificateAuthorityParamStore {
    return new CertificateAuthorityParamStore(authorityName);
  }

  public static supabase(): SupabaseParamStore {
    return new SupabaseParamStore();
  }

  public static retell(): RetellParamStore {
    return new RetellParamStore();
  }

  public static customerSync(tenantCode: string, source: string): CustomerSyncParamStore {
    return new CustomerSyncParamStore(tenantCode, source);
  }

  public static storage(bucketName: string): StorageParamStore {
    return new StorageParamStore(bucketName);
  }

  public static rdsInstance(dbName: string): RdsInstanceParamStore {
    return new RdsInstanceParamStore(dbName);
  }

  public static rdsCluster(dbName: string): RdsClusterParamStore {
    return new RdsClusterParamStore(dbName);
  }

  public static hyperswitchRds(): RdsInstanceParamStore {
    return new RdsInstanceParamStore('hyperswitch');
  }

  public static hyperswitchElasticache(): ElasticacheParamStore {
    return new ElasticacheParamStore('hyperswitch');
  }

  public static hyperswitchMigration(slug?: string): LambdaParamStore {
    return new LambdaParamStore('hyperswitch', `migration${slug ? `-${slug}` : ''}`);
  }
}

class ElasticacheParamStore {
  public readonly SSM_ELASTICACHE_ENDPOINT_PARAM: ParamStore;
  public readonly SSM_ELASTICACHE_SG_ID_PARAM: ParamStore;

  constructor(readonly elasticCacheName: string) {
    this.SSM_ELASTICACHE_ENDPOINT_PARAM = ParamStore.create(elasticCacheName, 'elasticache', 'endpoint');
    this.SSM_ELASTICACHE_SG_ID_PARAM = ParamStore.create(elasticCacheName, 'elasticache', 'sg-id');
  }
}

class LambdaParamStore {
  public readonly SSM_FUNCTION_ARN_PARAM: ParamStore;

  constructor(readonly name: string, readonly functionName: string) {
    this.SSM_FUNCTION_ARN_PARAM = ParamStore.create(name, functionName, 'function-arn');
  }
}

class StorageParamStore {
  public readonly SSM_STORAGE_BUCKET_ARN_PARAM: ParamStore;
  public readonly SSM_STORAGE_BUCKET_NAME_PARAM: ParamStore;

  constructor(readonly bucketName: string) {
    this.SSM_STORAGE_BUCKET_ARN_PARAM = ParamStore.create('storage', bucketName, 'bucket', 'arn');
    this.SSM_STORAGE_BUCKET_NAME_PARAM = ParamStore.create('storage', bucketName, 'bucket', 'name');
  }
}

class CertificateAuthorityParamStore {
  public readonly SSM_CERTIFICATE_AUTHORITY_ROOT_KEY_PARAM: ParamStore;
  public readonly SSM_CERTIFICATE_AUTHORITY_ROOT_CERT_PARAM: ParamStore;
  public readonly SSM_CERTIFICATE_AUTHORITY_CLIENT_KEY_PARAM: ParamStore;
  public readonly SSM_CERTIFICATE_AUTHORITY_CLIENT_CERT_PARAM: ParamStore;

  constructor(readonly authorityName: string) {
    this.SSM_CERTIFICATE_AUTHORITY_ROOT_KEY_PARAM = ParamStore.create('certificate-authority', authorityName, 'root', 'key');
    this.SSM_CERTIFICATE_AUTHORITY_ROOT_CERT_PARAM = ParamStore.create('certificate-authority', authorityName, 'root', 'cert');
    this.SSM_CERTIFICATE_AUTHORITY_CLIENT_KEY_PARAM = ParamStore.create('certificate-authority', authorityName, 'client', 'key');
    this.SSM_CERTIFICATE_AUTHORITY_CLIENT_CERT_PARAM = ParamStore.create('certificate-authority', authorityName, 'client', 'cert');
  }
}

class BatchParamStore {
  public readonly SSM_BATCH_JOB_QUEUE_ARN_PARAM: ParamStore;
  public readonly SSM_BATCH_JOB_DEFINITION_ARN_PARAM: ParamStore;
  public readonly SSM_BATCH_JOB_QUEUE_NAME_PARAM: ParamStore;
  public readonly SSM_BATCH_JOB_DEFINITION_NAME_PARAM: ParamStore;

  constructor(readonly jobName: string) {
    this.SSM_BATCH_JOB_QUEUE_ARN_PARAM = ParamStore.create('batch', jobName, 'job-queue-arn');
    this.SSM_BATCH_JOB_DEFINITION_ARN_PARAM = ParamStore.create('batch', jobName, 'job-definition-arn');
    this.SSM_BATCH_JOB_QUEUE_NAME_PARAM = ParamStore.create('batch', jobName, 'job-queue-name');
    this.SSM_BATCH_JOB_DEFINITION_NAME_PARAM = ParamStore.create('batch', jobName, 'job-definition-name');
  }
}

class RdsInstanceParamStore {
  public readonly SSM_RDS_ENDPOINT_PARAM: ParamStore;
  public readonly SSM_RDS_SECRET_ARN_PARAM: ParamStore;
  public readonly SSM_RDS_SG_ID_PARAM: ParamStore;

  constructor(readonly dbName: string) {
    this.SSM_RDS_ENDPOINT_PARAM = ParamStore.create(dbName, 'rds', 'endpoint');
    this.SSM_RDS_SECRET_ARN_PARAM = ParamStore.create(dbName, 'rds', 'secret-arn');
    this.SSM_RDS_SG_ID_PARAM = ParamStore.create(dbName, 'rds', 'sg-id');
  }
}

class RdsClusterParamStore {
  public readonly SSM_RDS_CLUSTER_ARN_PARAM: ParamStore;
  public readonly SSM_RDS_CLUSTER_ENDPOINT_PARAM: ParamStore;
  public readonly SSM_RDS_CLUSTER_PORT_PARAM: ParamStore;
  public readonly SSM_RDS_CLUSTER_MASTER_CREDENTIALS_SECRET_ARN_PARAM: ParamStore;
  public readonly SSM_RDS_CLUSTER_MASTER_CREDENTIALS_KMS_KEY_ID_PARAM: ParamStore;
  public readonly SSM_RDS_CLUSTER_MASTER_CREDENTIALS_KMS_KEY_ARN_PARAM: ParamStore;

  constructor(readonly dbName: string) {
    this.SSM_RDS_CLUSTER_ARN_PARAM = ParamStore.create(dbName, 'cluster', 'arn');
    this.SSM_RDS_CLUSTER_ENDPOINT_PARAM = ParamStore.create(dbName, 'cluster', 'endpoint');
    this.SSM_RDS_CLUSTER_PORT_PARAM = ParamStore.create(dbName, 'cluster', 'port');
    this.SSM_RDS_CLUSTER_MASTER_CREDENTIALS_SECRET_ARN_PARAM = ParamStore.create(dbName, 'cluster', 'master', 'credentials', 'secret', 'arn');
    this.SSM_RDS_CLUSTER_MASTER_CREDENTIALS_KMS_KEY_ID_PARAM = ParamStore.create(dbName, 'cluster', 'master', 'credentials', 'kms', 'key', 'id');
    this.SSM_RDS_CLUSTER_MASTER_CREDENTIALS_KMS_KEY_ARN_PARAM = ParamStore.create(dbName, 'cluster', 'master', 'credentials', 'kms', 'key', 'arn');
  }
}


class EksParamStore {
  // cluster
  public readonly SSM_EKS_CLUSTER_ARN: ParamStore;
  public readonly SSM_EKS_CLUSTER_NAME: ParamStore;
  public readonly SSM_EKS_CLUSTER_ENDPOINT: ParamStore;
  public readonly SSM_EKS_CLUSTER_OPEN_ID_CONNECT_ISSUER: ParamStore;
  public readonly SSM_EKS_CLUSTER_KUBECTL_ROLE_ARN: ParamStore;
  public readonly SSM_EKS_CLUSTER_KUBECTL_SG_ID: ParamStore;
  public readonly SSM_EKS_CLUSTER_CLUSTER_SG_ID: ParamStore;
  public readonly SSM_EKS_CLUSTER_OPEN_ID_CONNECT_PROVIDER_ARN: ParamStore;
  public readonly SSM_EKS_CLUSTER_KUBECTL_LAYER_ARN: ParamStore;
  public readonly SSM_EKS_CLUSTER_KUBECTL_PROVIDER_ROLE_ARN: ParamStore;
  public readonly SSM_EKS_CLUSTER_KUBECTL_PROVIDER_SERVICE_TOKEN: ParamStore;
  public readonly SSM_EKS_CLUSTER_KARPENTER_ROLE_ARN: ParamStore;

  constructor() {

    this.SSM_EKS_CLUSTER_ARN = ParamStore.create('eks', 'cluster', 'arn');
    this.SSM_EKS_CLUSTER_NAME = ParamStore.create('eks', 'cluster', 'name');
    this.SSM_EKS_CLUSTER_ENDPOINT = ParamStore.create('eks', 'cluster', 'endpoint');
    this.SSM_EKS_CLUSTER_OPEN_ID_CONNECT_ISSUER = ParamStore.create('eks', 'cluster', 'openIdConnectIssuer');
    this.SSM_EKS_CLUSTER_KUBECTL_ROLE_ARN = ParamStore.create('eks', 'cluster', 'kubectl', 'role', 'arn');
    this.SSM_EKS_CLUSTER_KUBECTL_SG_ID = ParamStore.create('eks', 'cluster', 'kubectl', 'sg', 'id');
    this.SSM_EKS_CLUSTER_CLUSTER_SG_ID = ParamStore.create('eks', 'cluster', 'cluster', 'sg', 'id');
    this.SSM_EKS_CLUSTER_OPEN_ID_CONNECT_PROVIDER_ARN = ParamStore.create('eks', 'cluster', 'openIdConnectProvider', 'arn');
    this.SSM_EKS_CLUSTER_KUBECTL_LAYER_ARN = ParamStore.create('eks', 'cluster', 'kubectl', 'layer', 'arn');
    this.SSM_EKS_CLUSTER_KUBECTL_PROVIDER_ROLE_ARN = ParamStore.create('eks', 'cluster', 'kubectl', 'provider', 'role', 'arn');
    this.SSM_EKS_CLUSTER_KUBECTL_PROVIDER_SERVICE_TOKEN = ParamStore.create('eks', 'cluster', 'kubectl', 'provider', 'service', 'token');
    this.SSM_EKS_CLUSTER_KARPENTER_ROLE_ARN = ParamStore.create('eks', 'cluster', 'karpenter', 'role', 'arn');
  }
}

class EcrParamStore {
  public readonly SSM_ECR_URI_PARAM: ParamStore;
  public readonly SSM_ECR_ARN_PARAM: ParamStore;
  public readonly SSM_ECR_NAME_PARAM: ParamStore;

  constructor(readonly repositoryName: string) {
    this.SSM_ECR_URI_PARAM = ParamStore.create('ecr', repositoryName, 'uri');
    this.SSM_ECR_ARN_PARAM = ParamStore.create('ecr', repositoryName, 'arn');
    this.SSM_ECR_NAME_PARAM = ParamStore.create('ecr', repositoryName, 'name');
  }
}

class HostedZoneParamStore {
  public readonly SSM_HOSTED_ZONE_ID_PARAM: ParamStore;
  public readonly SSM_HOSTED_ZONE_ROLE_ARN_PARAM: ParamStore;

  constructor(readonly hostedZoneName: string) {
    this.SSM_HOSTED_ZONE_ID_PARAM = ParamStore.create('hosted-zone', hostedZoneName, 'id');
    this.SSM_HOSTED_ZONE_ROLE_ARN_PARAM = ParamStore.create('hosted-zone', hostedZoneName, 'role', 'arn');
  }
}

class CertificateParamStore {
  public readonly SSM_CERTIFICATE_ARN_PARAM: ParamStore;
  public readonly SSM_CERTIFICATE_ID_PARAM: ParamStore;

  constructor(readonly domainName: string) {
    const sanitizedDomainName = capitalize(domainName.replace('*.', 'Wildcard'));
    this.SSM_CERTIFICATE_ARN_PARAM = ParamStore.create('certificate', sanitizedDomainName, 'arn');
    this.SSM_CERTIFICATE_ID_PARAM = ParamStore.create('certificate', sanitizedDomainName, 'id');
  }
}

class SupabaseParamStore {
  public readonly SSM_SUPABASE_CONNECTION_PARAM: ParamStore;

  constructor() {
    this.SSM_SUPABASE_CONNECTION_PARAM = ParamStore.create('supabase', 'connection');
  }
}

class RetellParamStore {
  public readonly SSM_RETELL_API_KEY_PARAM: ParamStore;

  constructor() {
    this.SSM_RETELL_API_KEY_PARAM = ParamStore.create('retell', 'api-key');
  }
}

class CustomerSyncParamStore {
  public readonly SSM_CUSTOMER_SYNC_MARIADB_PARAM: { value: string };

  constructor(readonly tenantCode: string, readonly source: string) {
    // Note: Using raw parameter name without 'ashanti' prefix for backward compatibility
    this.SSM_CUSTOMER_SYNC_MARIADB_PARAM = { value: `/customer-sync/${tenantCode}/${source}/mariadb` };
  }
}

class VpcParamStore {
  public readonly SSM_VPC_ID_PARAM: ParamStore;
  public readonly SSM_VPC_CIDR_PARAM: ParamStore;
  public readonly SSM_VPC_AZS_PARAM: ParamStore;

  // Public Subnets
  public readonly SSM_VPC_PUBLIC_SUBNET_IPV4_CIDR_BLOCKS_PARAM: ParamStore;
  public readonly SSM_VPC_PUBLIC_SUBNET_ROUTE_TABLE_IDS_PARAM: ParamStore;
  public readonly SSM_VPC_PUBLIC_SUBNET_IDS_PARAM: ParamStore;
  public readonly SSM_VPC_PUBLIC_SUBNET_AZS_PARAM: ParamStore;

  // Private Subnets
  public readonly SSM_VPC_PRIVATE_SUBNET_IPV4_CIDR_BLOCKS_PARAM: ParamStore;
  public readonly SSM_VPC_PRIVATE_SUBNET_ROUTE_TABLE_IDS_PARAM: ParamStore;
  public readonly SSM_VPC_PRIVATE_SUBNET_IDS_PARAM: ParamStore;
  public readonly SSM_VPC_PRIVATE_SUBNET_AZS_PARAM: ParamStore;

  // Isolated Subnets
  public readonly SSM_VPC_ISOLATED_SUBNET_IPV4_CIDR_BLOCKS_PARAM: ParamStore;
  public readonly SSM_VPC_ISOLATED_SUBNET_ROUTE_TABLE_IDS_PARAM: ParamStore;
  public readonly SSM_VPC_ISOLATED_SUBNET_IDS_PARAM: ParamStore;
  public readonly SSM_VPC_ISOLATED_SUBNET_AZS_PARAM: ParamStore;

  // VPN Gateway
  public readonly SSM_VPC_VPN_GATEWAY_ID_PARAM: ParamStore;

  // Transit Gateway Attachment
  public readonly SSM_VPC_TRANSIT_GATEWAY_ATTACHMENT_ID_PARAM: ParamStore;


  constructor() {
    this.SSM_VPC_ID_PARAM = ParamStore.create('vpc', 'id');
    this.SSM_VPC_CIDR_PARAM = ParamStore.create('vpc', 'cidr');
    this.SSM_VPC_AZS_PARAM = ParamStore.create('vpc', 'azs');

    // Public Subnets
    this.SSM_VPC_PUBLIC_SUBNET_IDS_PARAM = ParamStore.create('vpc', 'public', 'subnet', 'ids');
    this.SSM_VPC_PUBLIC_SUBNET_ROUTE_TABLE_IDS_PARAM = ParamStore.create('vpc', 'public', 'subnet', 'route-table', 'ids');
    this.SSM_VPC_PUBLIC_SUBNET_IPV4_CIDR_BLOCKS_PARAM = ParamStore.create('vpc', 'public', 'subnet', 'cidr-blocks');
    this.SSM_VPC_PUBLIC_SUBNET_AZS_PARAM = ParamStore.create('vpc', 'public', 'subnet', 'azs');

    // Private Subnets
    this.SSM_VPC_PRIVATE_SUBNET_IDS_PARAM = ParamStore.create('vpc', 'private', 'subnet', 'ids');
    this.SSM_VPC_PRIVATE_SUBNET_ROUTE_TABLE_IDS_PARAM = ParamStore.create('vpc', 'private', 'subnet', 'route-table', 'ids');
    this.SSM_VPC_PRIVATE_SUBNET_IPV4_CIDR_BLOCKS_PARAM = ParamStore.create('vpc', 'private', 'subnet', 'cidr-blocks');
    this.SSM_VPC_PRIVATE_SUBNET_AZS_PARAM = ParamStore.create('vpc', 'private', 'subnet', 'azs');

    // Isolated Subnets
    this.SSM_VPC_ISOLATED_SUBNET_IDS_PARAM = ParamStore.create('vpc', 'isolated', 'subnet', 'ids');
    this.SSM_VPC_ISOLATED_SUBNET_ROUTE_TABLE_IDS_PARAM = ParamStore.create('vpc', 'isolated', 'subnet', 'route-table', 'ids');
    this.SSM_VPC_ISOLATED_SUBNET_IPV4_CIDR_BLOCKS_PARAM = ParamStore.create('vpc', 'isolated', 'subnet', 'cidr-blocks');
    this.SSM_VPC_ISOLATED_SUBNET_AZS_PARAM = ParamStore.create('vpc', 'isolated', 'subnet', 'azs');

    // VPN Gateway
    this.SSM_VPC_VPN_GATEWAY_ID_PARAM = ParamStore.create('vpc', 'vpn', 'gateway', 'id');

    // Transit Gateway Attachment
    this.SSM_VPC_TRANSIT_GATEWAY_ATTACHMENT_ID_PARAM = ParamStore.create('vpc', 'transit-gateway', 'attachment', 'id');
  }
}
