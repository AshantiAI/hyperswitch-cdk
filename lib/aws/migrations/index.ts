/**
 * AWS Lambda handler for Hyperswitch database migrations using Diesel CLI.
 * This function runs as a CloudFormation CustomResource via CDK Provider.
 * The Provider handles CloudFormation protocol automatically.
 */

import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import type {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
  CloudFormationCustomResourceDeleteEvent,
  Context
} from "aws-lambda";

// Initialize AWS clients
const secretsManager = new SecretsManagerClient({});

// CDK Provider response format (simpler than full CloudFormation response)
interface ProviderResponse {
  PhysicalResourceId: string;
  Data?: Record<string, any>;
}

interface DatabaseCredentials {
  host: string;
  port: string;
  username: string;
  password: string;
  dbname: string;
}

interface MigrationResult {
  success: boolean;
  output: string;
  metadata: Record<string, any>;
}


/**
 * Retrieve database credentials from AWS Secrets Manager.
 */
async function getDatabaseCredentials(secretArn: string): Promise<DatabaseCredentials> {
  console.log(`Retrieving database credentials from: ${secretArn}`);

  const command = new GetSecretValueCommand({ SecretId: secretArn });
  const response = await secretsManager.send(command);

  if (!response.SecretString) {
    throw new Error("Secret value is empty");
  }

  const credentials = JSON.parse(response.SecretString);

  return {
    host: credentials.host,
    port: String(credentials.port || 5432),
    username: credentials.username,
    password: credentials.password,
    dbname: credentials.dbname
  };
}

/**
 * Run Diesel migrations and return success status, output, and metadata.
 */
function runMigrations(databaseUrl: string): MigrationResult {
  console.log("Starting Diesel migrations...");
  console.log(`Working directory: ${process.cwd()}`);
  console.log(`Hyperswitch version: ${process.env.HYPERSWITCH_VERSION || "unknown"}`);

  // Change to migrations directory
  const migrationsDir = "/opt/hyperswitch";
  process.chdir(migrationsDir);

  // Verify diesel and migration files exist
  if (!fs.existsSync("migrations")) {
    return {
      success: false,
      output: "Migrations directory not found",
      metadata: {}
    };
  }

  if (!fs.existsSync("diesel.toml")) {
    return {
      success: false,
      output: "diesel.toml not found",
      metadata: {}
    };
  }

  // Count migration files
  const migrationDirs = fs.readdirSync("migrations").filter((file) => {
    return fs.statSync(path.join("migrations", file)).isDirectory();
  });
  const migrationCount = migrationDirs.length;
  console.log(`Found ${migrationCount} migration directories`);

  try {
    // Run diesel migration run (diesel is in PATH from Dockerfile)
    const output = execSync("diesel migration run", {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      encoding: "utf-8",
      timeout: 600000, // 10 minute timeout
      stdio: ["inherit", "pipe", "pipe"]
    });

    console.log(`Diesel output:\n${output}`);

    return {
      success: true,
      output,
      metadata: {
        migration_count: migrationCount,
        return_code: 0
      }
    };
  } catch (error: any) {
    const output = error.stdout?.toString() || "" + "\n" + (error.stderr?.toString() || "");
    console.log(`Diesel output:\n${output}`);

    return {
      success: false,
      output,
      metadata: {
        migration_count: migrationCount,
        return_code: error.status || -1
      }
    };
  }
}

/**
 * Perform database migrations.
 */
async function performMigrations(context: Context): Promise<ProviderResponse> {
  // Get database secret ARN from environment
  const dbSecretArn = process.env.DB_SECRET_ARN;
  if (!dbSecretArn) {
    throw new Error("DB_SECRET_ARN environment variable not set");
  }

  // Retrieve database credentials
  const dbCreds = await getDatabaseCredentials(dbSecretArn);

  // Log DNS resolution for debugging
  console.log(`RDS hostname: ${dbCreds.host}`);
  try {
    const dns = require('dns').promises;
    const addresses = await dns.resolve4(dbCreds.host);
    console.log(`Resolved IPs: ${JSON.stringify(addresses)}`);
  } catch (dnsError: any) {
    console.log(`DNS resolution error: ${dnsError.message}`);
  }

  // Construct DATABASE_URL
  const databaseUrl = `postgresql://${dbCreds.username}:${dbCreds.password}@${dbCreds.host}:${dbCreds.port}/${dbCreds.dbname}`;

  // Run migrations
  const result = runMigrations(databaseUrl);

  if (result.success) {
    console.log("✅ Migrations completed successfully");
    console.log(`Output: ${result.output}`);
    return {
      PhysicalResourceId: context.logStreamName,
      Data: {
        message: "Migrations completed successfully",
        version: process.env.HYPERSWITCH_VERSION || "unknown",
        output: result.output,
        ...result.metadata
      }
    };
  } else {
    console.error("❌ Migration failed");
    console.error(`Output: ${result.output}`);
    throw new Error(`Migration failed: ${result.output}`);
  }
}

/**
 * Handle CREATE request - run migrations.
 */
async function createMigrationResource(
  _event: CloudFormationCustomResourceCreateEvent,
  context: Context
): Promise<ProviderResponse> {
  console.log("CREATE request - running database migrations");
  return await performMigrations(context);
}

/**
 * Handle UPDATE request - run migrations (idempotent).
 */
async function updateMigrationResource(
  _event: CloudFormationCustomResourceUpdateEvent,
  context: Context
): Promise<ProviderResponse> {
  console.log("UPDATE request - running database migrations");
  return await performMigrations(context);
}

/**
 * Handle DELETE request - no action needed (migrations are not reverted).
 */
async function deleteMigrationResource(
  event: CloudFormationCustomResourceDeleteEvent,
  context: Context
): Promise<ProviderResponse> {
  console.log("DELETE request - no action needed for database migrations");
  return {
    PhysicalResourceId: event.PhysicalResourceId || context.logStreamName,
    Data: {
      message: "Delete completed - migrations are not reverted"
    }
  };
}

/**
 * Lambda handler for running Hyperswitch database migrations.
 * The CDK Provider handles CloudFormation protocol automatically.
 *
 * Expected environment variables:
 *   - DB_SECRET_ARN: ARN of the Secrets Manager secret containing DB credentials
 *   - HYPERSWITCH_VERSION: Version of Hyperswitch being deployed
 *
 * CloudFormation CustomResource events:
 *   - Create: Run migrations
 *   - Update: Run migrations (idempotent)
 *   - Delete: No action (migrations are not reverted)
 */
export async function handler(
  event: CloudFormationCustomResourceEvent,
  context: Context
): Promise<ProviderResponse> {
  console.log(`Event: ${JSON.stringify(event)}`);

  switch (event.RequestType) {
    case "Create":
      return await createMigrationResource(event as CloudFormationCustomResourceCreateEvent, context);
    case "Update":
      return await updateMigrationResource(event as CloudFormationCustomResourceUpdateEvent, context);
    case "Delete":
      return await deleteMigrationResource(event as CloudFormationCustomResourceDeleteEvent, context);
  }
}
