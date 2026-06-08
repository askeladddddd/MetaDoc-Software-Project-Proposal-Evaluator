import os
import sys
import sqlalchemy as sa
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# Add parent directory to path to import config if needed
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def backup_database():
    print("Starting Database Backup from Supabase to Local SQLite...")
    
    # Load environment variables
    load_dotenv()
    
    pg_url = os.environ.get('DATABASE_URL')
    if not pg_url:
        print("Error: DATABASE_URL not found in .env")
        return

    # Fix postgres:// to postgresql:// if needed
    if pg_url.startswith("postgres://"):
        pg_url = pg_url.replace("postgres://", "postgresql+psycopg2://", 1)
    elif pg_url.startswith("postgresql://"):
        pg_url = pg_url.replace("postgresql://", "postgresql+psycopg2://", 1)
    
    # Target path
    # We want to put it in frontend/metadoc/
    root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    target_dir = os.path.join(root_dir, 'frontend', 'metadoc')
    
    if not os.path.exists(target_dir):
        os.makedirs(target_dir, exist_ok=True)
    
    sqlite_path = os.path.join(target_dir, 'database_backup.db')
    sqlite_url = f"sqlite:///{sqlite_path}"
    
    print(f"Connecting to Supabase...")
    try:
        # Use pool_pre_ping to handle dropped connections
        pg_engine = sa.create_engine(pg_url, pool_pre_ping=True)
        sqlite_engine = sa.create_engine(sqlite_url)
        
        pg_metadata = sa.MetaData()
        
        print("Reflecting tables from Supabase (this may take a moment)...")
        # Connect explicitly to ensure connection is open
        with pg_engine.connect() as conn:
            pg_metadata.reflect(bind=conn)
        
        print(f"Found {len(pg_metadata.tables)} tables. Copying schema and data...")
        
        # FIX: Map PostgreSQL types to SQLite compatible types
        from sqlalchemy.dialects.postgresql import BYTEA, JSONB, UUID, TIMESTAMP
        from sqlalchemy.types import LargeBinary, JSON, String, DateTime
        
        for table in pg_metadata.tables.values():
            for column in table.columns:
                if isinstance(column.type, BYTEA):
                    column.type = LargeBinary()
                elif isinstance(column.type, (JSONB, JSON)):
                    column.type = JSON()
                elif isinstance(column.type, UUID):
                    column.type = String(36)
                elif isinstance(column.type, TIMESTAMP):
                    column.type = DateTime()

        # Drop if exists and create all tables in SQLite
        pg_metadata.drop_all(sqlite_engine)
        pg_metadata.create_all(sqlite_engine)
        
        # Copy data table by table
        for table_name in pg_metadata.tables:
            table = pg_metadata.tables[table_name]
            print(f"  Copying table: {table_name}...", end="", flush=True)
            
            # Fetch all data from Postgres
            with pg_engine.connect() as pg_conn:
                result = pg_conn.execute(table.select())
                rows = [dict(row._mapping) for row in result]
            
            if rows:
                # Insert into SQLite
                with sqlite_engine.connect() as sqlite_conn:
                    # Use chunking for large tables
                    chunk_size = 500
                    for i in range(0, len(rows), chunk_size):
                        chunk = rows[i:i + chunk_size]
                        sqlite_conn.execute(table.insert(), chunk)
                        sqlite_conn.commit()
                print(f" Done ({len(rows)} rows)")
            else:
                print(" Empty")
                
        print(f"\nBackup complete! File saved at: {sqlite_path}")
        
    except Exception as e:
        print(f"\nError during backup: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    backup_database()
