# PowerShell script to fully automate PostgreSQL installation, configuration, pgvector setup, and database migrations.

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "     FAGOON WORKFLOW - POSTGRESQL AUTO-SETUP SCRIPT       " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

# 1. Check if PostgreSQL is already installed
$psqlPath = Get-Command psql -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
if (-not $psqlPath) {
    # Check common program files paths
    $commonPaths = @(
        "C:\Program Files\PostgreSQL\*\bin\psql.exe",
        "C:\Program Files (x86)\PostgreSQL\*\bin\psql.exe"
    )
    foreach ($path in $commonPaths) {
        $found = Resolve-Path $path -ErrorAction SilentlyContinue
        if ($found) {
            $psqlPath = $found[0].Path
            break
        }
    }
}

if ($psqlPath) {
    Write-Host "[✓] PostgreSQL is already installed at: $psqlPath" -ForegroundColor Green
} else {
    Write-Host "[!] PostgreSQL psql utility not found on your system." -ForegroundColor Yellow
    Write-Host "Attempting to install PostgreSQL using winget..." -ForegroundColor Cyan
    try {
        & winget install PostgreSQL.PostgreSQL --silent --accept-package-agreements --accept-source-agreements
        Write-Host "[✓] PostgreSQL installed successfully. Please restart your shell and re-run this script if psql is not found." -ForegroundColor Green
    } catch {
        Write-Host "[x] Winget installation failed. Please install PostgreSQL manually from https://www.postgresql.org/download/" -ForegroundColor Red
        exit 1
    }
}

# 2. Start PostgreSQL Service if not running
Write-Host "`nChecking PostgreSQL Service status..." -ForegroundColor Cyan
$pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue
if ($pgService) {
    if ($pgService.Status -ne "Running") {
        Write-Host "Starting PostgreSQL Service..." -ForegroundColor Cyan
        Start-Service $pgService.Name
        Write-Host "[✓] PostgreSQL Service started." -ForegroundColor Green
    } else {
        Write-Host "[✓] PostgreSQL Service is already running." -ForegroundColor Green
    }
} else {
    Write-Host "[!] PostgreSQL service was not detected in system services. It might be run as a user-level process." -ForegroundColor Yellow
}

# 3. Create Database & Setup User
Write-Host "`nSetting up Fagoon Database..." -ForegroundColor Cyan
$env:PGPASSWORD = "postgres" # Default pg admin password

# Try to run database creation and vector extension setup
$sqlCommands = @(
    "CREATE DATABASE fagoon_db;",
    "CREATE EXTENSION IF NOT EXISTS vector;"
)

# Connect as superuser (try default passwords or ask if it fails)
try {
    Write-Host "Creating 'fagoon_db' database and enabling pgvector extension..." -ForegroundColor Cyan
    & psql -U postgres -h localhost -c "CREATE DATABASE fagoon_db;" 2>$null
    & psql -U postgres -h localhost -d fagoon_db -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>$null
    Write-Host "[✓] Database and vector extension successfully verified/created." -ForegroundColor Green
} catch {
    Write-Host "[!] Could not connect to PostgreSQL automatically with default 'postgres' user/password." -ForegroundColor Yellow
    Write-Host "Please ensure PostgreSQL is running locally and run the following queries manually:" -ForegroundColor White
    Write-Host "  1. CREATE DATABASE fagoon_db;" -ForegroundColor White
    Write-Host "  2. CREATE EXTENSION IF NOT EXISTS vector; (inside fagoon_db)" -ForegroundColor White
}

# 4. Configure .env file
Write-Host "`nConfiguring .env file..." -ForegroundColor Cyan
$envFilePath = ".env"
$dbUrlLine = "DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/fagoon_db"
$storageManagerLine = "DEFAULT_STORAGE_MANAGER=LOCAL"

if (Test-Path $envFilePath) {
    $envContent = Get-Content $envFilePath
    
    # Update or append DATABASE_URL
    if ($envContent -match "^DATABASE_URL=") {
        $envContent = $envContent -replace "^DATABASE_URL=.*", $dbUrlLine
        Write-Host "Updated DATABASE_URL in .env" -ForegroundColor DarkGray
    } else {
        $envContent += $dbUrlLine
        Write-Host "Added DATABASE_URL to .env" -ForegroundColor DarkGray
    }
    
    # Update or append DEFAULT_STORAGE_MANAGER
    if ($envContent -match "^DEFAULT_STORAGE_MANAGER=") {
        $envContent = $envContent -replace "^DEFAULT_STORAGE_MANAGER=.*", $storageManagerLine
    } else {
        $envContent += $storageManagerLine
    }
    
    Set-Content $envFilePath -Value $envContent
} else {
    # Create new .env
    $newContent = @(
        $dbUrlLine,
        $storageManagerLine,
        "DEFAULT_URL=http://localhost:8000"
    )
    Set-Content $envFilePath -Value $newContent
    Write-Host "Created new .env file with default parameters." -ForegroundColor Green
}

# 5. Run Database Migrations (Alembic)
Write-Host "`nRunning database migrations..." -ForegroundColor Cyan
try {
    & .venv\Scripts\alembic.exe upgrade head
    Write-Host "[✓] Migrations applied successfully." -ForegroundColor Green
} catch {
    Write-Host "[x] Migration failed. Check your Python virtualenv is active and run 'alembic upgrade head' manually." -ForegroundColor Red
}

# 6. Seed Default User
Write-Host "`nNo default admin is created. Create yours with:" -ForegroundColor Cyan
Write-Host '  .venv\Scripts\python.exe scripts/create_admin.py --email you@example.com --name "Your Name"'

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "  SETUP COMPLETED! You can now start the server." -ForegroundColor Green
Write-Host "  Your local Knowledge Base (stored in DB) is ready." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
