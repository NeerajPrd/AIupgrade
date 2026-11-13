#!/bin/bash
set -e

# Shell script to fully automate PostgreSQL installation, configuration, pgvector setup, and database migrations.

echo "=========================================================="
echo "     FAGOON WORKFLOW - POSTGRESQL AUTO-SETUP SCRIPT       "
echo "=========================================================="

# 1. Check if PostgreSQL is already installed
if command -v psql &> /dev/null; then
    echo "[✓] PostgreSQL is already installed."
else
    echo "[!] PostgreSQL psql utility not found on your system."
    echo "Attempting to install PostgreSQL using package manager..."
    
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if command -v apt-get &> /dev/null; then
            sudo apt-get update
            sudo apt-get install -y postgresql postgresql-contrib
        elif command -v yum &> /dev/null; then
            sudo yum install -y postgresql-server postgresql-contrib
        else
            echo "[x] Unsupported Linux distribution. Please install PostgreSQL manually."
            exit 1
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        if command -v brew &> /dev/null; then
            brew install postgresql
        else
            echo "[x] Homebrew is not installed. Please install Homebrew or PostgreSQL manually."
            exit 1
        fi
    else
        echo "[x] Unsupported Operating System. Please install PostgreSQL manually."
        exit 1
    fi
fi

# 2. Start PostgreSQL Service if not running
echo -e "\nChecking PostgreSQL Service status..."
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    if command -v systemctl &> /dev/null; then
        sudo systemctl start postgresql
        sudo systemctl enable postgresql
    else
        sudo service postgresql start
    fi
elif [[ "$OSTYPE" == "darwin"* ]]; then
    brew services start postgresql || true
fi
echo "[✓] PostgreSQL Service started."

# 3. Create Database & Setup User
echo -e "\nSetting up Fagoon Database..."
export PGPASSWORD="postgres"

try_pg_setup() {
    echo "Creating 'fagoon_db' database and enabling pgvector extension..."
    psql -U postgres -h localhost -c "CREATE DATABASE fagoon_db;" 2>/dev/null || true
    psql -U postgres -h localhost -d fagoon_db -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>/dev/null || true
}

try_pg_setup || {
    echo "[!] Could not connect automatically as 'postgres' user."
    echo "Please ensure PostgreSQL is running and execute these queries manually:"
    echo "  1. CREATE DATABASE fagoon_db;"
    echo "  2. CREATE EXTENSION IF NOT EXISTS vector; (inside fagoon_db)"
}

# 4. Configure .env file
echo -e "\nConfiguring .env file..."
ENV_FILE=".env"
DB_LINE="DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/fagoon_db"
STORAGE_LINE="DEFAULT_STORAGE_MANAGER=LOCAL"

if [ -f "$ENV_FILE" ]; then
    # Update or append DATABASE_URL
    if grep -q "^DATABASE_URL=" "$ENV_FILE"; then
        sed -i 's|^DATABASE_URL=.*|'"$DB_LINE"'|' "$ENV_FILE" 2>/dev/null || sed -i "" 's|^DATABASE_URL=.*|'"$DB_LINE"'|' "$ENV_FILE"
        echo "Updated DATABASE_URL in .env"
    else
        echo "$DB_LINE" >> "$ENV_FILE"
        echo "Added DATABASE_URL to .env"
    fi
    
    # Update or append DEFAULT_STORAGE_MANAGER
    if grep -q "^DEFAULT_STORAGE_MANAGER=" "$ENV_FILE"; then
        sed -i 's|^DEFAULT_STORAGE_MANAGER=.*|'"$STORAGE_LINE"'|' "$ENV_FILE" 2>/dev/null || sed -i "" 's|^DEFAULT_STORAGE_MANAGER=.*|'"$STORAGE_LINE"'|' "$ENV_FILE"
    else
        echo "$STORAGE_LINE" >> "$ENV_FILE"
    fi
else
    echo -e "$DB_LINE\n$STORAGE_LINE\nDEFAULT_URL=http://localhost:8000" > "$ENV_FILE"
    echo "Created new .env file with default parameters."
fi

# 5. Run Database Migrations (Alembic)
echo -e "\nRunning database migrations..."
if [ -f ".venv/bin/alembic" ]; then
    .venv/bin/alembic upgrade head
    echo "[✓] Migrations applied successfully."
else
    echo "[!] .venv/bin/alembic not found. Trying global 'alembic' command..."
    alembic upgrade head || echo "[x] Migration failed. Check your Python environment and run 'alembic upgrade head' manually."
fi

# 6. Seed Default User
echo -e "\nNo default admin is created. Create yours with:"
echo "  python scripts/create_admin.py --email you@example.com --name \"Your Name\""

echo -e "\n=========================================================="
echo "  SETUP COMPLETED! You can now start the server."
echo "  Your local Knowledge Base (stored in DB) is ready."
echo "=========================================================="
