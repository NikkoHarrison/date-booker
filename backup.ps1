# Set PostgreSQL paths
$pgBin = "C:\Program Files\PostgreSQL\16\bin"
$env:Path = "$pgBin;$env:Path"

# Set connection parameters
$password = "XjA33XaZMkFsH9IZ"
$env:PGPASSWORD = $password
$connectionString = "postgresql://postgres.zukrrpxianksfmfoioor:${password}@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require"

Write-Host "Starting database backup..."

try {
    # Create backup with timestamp
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $backupFile = "backup_${timestamp}.sql"
    
    Write-Host "Testing connection..."
    
    # Test connection first using connection string
    & "$pgBin\pg_isready" --dbname="$connectionString"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Connection successful. Starting backup..."
        
        # Run pg_dump with connection string
        & "$pgBin\pg_dump" `
            --dbname="$connectionString" `
            --no-owner `
            --no-acl `
            --clean `
            --if-exists `
            --quote-all-identifiers `
            --exclude-schema='extensions|graphql|graphql_public|net|tiger|pgbouncer|vault|realtime|supabase_functions|storage|pg*|information_schema' `
            --schema '*' > $backupFile
            
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Backup completed successfully! Saved to: $backupFile"
            Write-Host "Backup file location: $((Get-Item $backupFile).FullName)"
        } else {
            Write-Host "Backup failed with exit code: $LASTEXITCODE"
        }
    } else {
        Write-Host "Failed to connect to the database. Please check your connection settings."
    }
} catch {
    Write-Host "An error occurred: $_"
} finally {
    # Clear the password
    $env:PGPASSWORD = ""
} 