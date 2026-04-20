#!/usr/bin/env python3
"""
Supabase Database & Storage Migration Script
=============================================
Migrates all tables, data, and storage bucket files from the old Supabase
project to the new one.

Old DB: postgresql://postgres.bkejibnvlolkgqkotmko:...@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres
New DB: postgresql://postgres.lmfjlztnvjmqyabjzcuk:...@aws-0-eu-west-1.pooler.supabase.com:6543/postgres
"""

import sys
import json
import urllib.request
import urllib.error
from datetime import datetime, date
from decimal import Decimal

from sqlalchemy import create_engine, MetaData, text, inspect
from sqlalchemy.orm import sessionmaker

# ─── Connection Strings ──────────────────────────────────────────────────────

OLD_DB_URL = (
    "postgresql+psycopg2://postgres.bkejibnvlolkgqkotmko:yQm2rZFFft3rnk65"
    "@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres"
)
NEW_DB_URL = (
    "postgresql+psycopg2://postgres.lmfjlztnvjmqyabjzcuk:MP1XMJjjGi43X6rb"
    "@aws-0-eu-west-1.pooler.supabase.com:6543/postgres"
)

# Old Supabase project
OLD_SUPABASE_URL = "https://bkejibnvlolkgqkotmko.supabase.co"
OLD_SUPABASE_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrZWppYm52bG9sa2dxa290bWtvIiwi"
    "cm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE5OTg2OCwiZXhwIjoyMDkw"
    "Nzc1ODY4fQ.rUWaG8cJZCI8RQM-pQA2SAIcHoiLdxGz4_T0E9zHHcE"
)

# New Supabase project  – derived from the pooler ref
NEW_SUPABASE_URL = "https://lmfjlztnvjmqyabjzcuk.supabase.co"
NEW_SUPABASE_KEY = None  # Will be prompted

STORAGE_BUCKET = "profile-images"

# Tables to migrate in dependency order (parents first)
TABLE_ORDER = ["boutique", "user", "dress", "shortlistitem", "booking"]


# ─── Helpers ──────────────────────────────────────────────────────────────────

def serialise_value(v):
    """Make a value JSON-safe for debugging output."""
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return float(v)
    return v


def print_banner(msg):
    print(f"\n{'='*60}")
    print(f"  {msg}")
    print(f"{'='*60}")


def print_step(msg):
    print(f"  → {msg}")


def print_ok(msg):
    print(f"  ✅ {msg}")


def print_warn(msg):
    print(f"  ⚠️  {msg}")


def print_err(msg):
    print(f"  ❌ {msg}")


# ─── Phase 1: Migrate Schema & Data ──────────────────────────────────────────

def migrate_database():
    print_banner("Phase 1 — Database Schema & Data Migration")

    # Connect to both databases
    print_step("Connecting to OLD database…")
    old_engine = create_engine(OLD_DB_URL, pool_pre_ping=True)
    with old_engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    print_ok("Connected to OLD database")

    print_step("Connecting to NEW database…")
    new_engine = create_engine(NEW_DB_URL, pool_pre_ping=True)
    with new_engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    print_ok("Connected to NEW database")

    # Reflect old schema
    print_step("Reflecting tables from OLD database…")
    old_meta = MetaData()
    old_meta.reflect(bind=old_engine)

    available_tables = set(old_meta.tables.keys())
    print_ok(f"Found tables: {sorted(available_tables)}")

    # Determine migration order — respect TABLE_ORDER, then add any extras
    ordered = [t for t in TABLE_ORDER if t in available_tables]
    extras = sorted(available_tables - set(ordered))
    if extras:
        # Prepend extras like alembic_version that have no FK deps
        ordered = extras + ordered
    print_step(f"Migration order: {ordered}")

    # ── Create tables on new DB ──
    print_step("Creating tables on NEW database…")
    new_meta = MetaData()
    new_meta.reflect(bind=new_engine)
    existing_new_tables = set(new_meta.tables.keys())

    # Build a new MetaData with only the tables we need, targeting new engine
    tables_to_create = MetaData()
    for tname in ordered:
        table = old_meta.tables[tname]
        table.to_metadata(tables_to_create)

    tables_to_create.create_all(bind=new_engine, checkfirst=True)
    print_ok("Tables created (or already exist)")

    # ── Copy data ──
    OldSession = sessionmaker(bind=old_engine)
    NewSession = sessionmaker(bind=new_engine)

    for tname in ordered:
        table = old_meta.tables[tname]
        print_step(f"Migrating table: {tname}")

        # Read all rows from old
        with old_engine.connect() as conn:
            rows = conn.execute(table.select()).fetchall()

        if not rows:
            print_warn(f"  {tname}: 0 rows — skipping")
            continue

        columns = table.columns.keys()
        row_dicts = [dict(zip(columns, row)) for row in rows]

        # Check existing row count in new db
        with new_engine.connect() as conn:
            new_table = tables_to_create.tables[tname]
            existing_count = conn.execute(
                text(f'SELECT count(*) FROM "{tname}"')
            ).scalar()

        if existing_count > 0:
            print_warn(f"  {tname}: {existing_count} rows already in NEW db — clearing before insert")
            with new_engine.begin() as conn:
                # Temporarily disable FK constraints for clean truncation
                conn.execute(text(f'TRUNCATE TABLE "{tname}" CASCADE'))

        # Insert in batches
        batch_size = 500
        new_table = tables_to_create.tables[tname]
        inserted = 0
        with new_engine.begin() as conn:
            for i in range(0, len(row_dicts), batch_size):
                batch = row_dicts[i:i + batch_size]
                conn.execute(new_table.insert(), batch)
                inserted += len(batch)

        print_ok(f"  {tname}: {inserted} rows migrated")

        # Reset sequences for tables with integer serial/identity primary keys
        pk_cols = [c.name for c in table.primary_key.columns]
        if pk_cols:
            pk = pk_cols[0]
            pk_col = table.columns[pk]
            # Only reset sequences for integer primary keys
            pk_type_str = str(pk_col.type).upper()
            if any(t in pk_type_str for t in ["INT", "SERIAL", "BIGINT", "SMALLINT"]):
                try:
                    with new_engine.begin() as conn:
                        max_id = conn.execute(
                            text(f'SELECT COALESCE(MAX("{pk}"), 0) FROM "{tname}"')
                        ).scalar()
                        # Try to find and reset the sequence
                        seq_name = f"{tname}_{pk}_seq"
                        conn.execute(
                            text(f"SELECT setval('{seq_name}', :val, true)"),
                            {"val": max(max_id, 1)}
                        )
                        print_ok(f"  {tname}: sequence '{seq_name}' reset to {max_id}")
                except Exception as e:
                    # Sequence might not exist
                    print_warn(f"  {tname}: could not reset sequence ({e})")

    print_ok("Database migration complete!")
    return True


# ─── Phase 2: Migrate Storage Bucket ────────────────────────────────────────

def supabase_request(base_url, key, path, method="GET", data=None, binary=False):
    """Make an authenticated request to the Supabase Storage API."""
    url = f"{base_url}/storage/v1{path}"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
    }
    body = None
    if data is not None and not binary:
        headers["Content-Type"] = "application/json"
        body = json.dumps(data).encode()
    elif binary:
        body = data

    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(req)
        content_type = resp.headers.get("Content-Type", "")
        raw = resp.read()
        if "application/json" in content_type:
            return json.loads(raw)
        return raw
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()
        raise RuntimeError(f"Supabase request failed ({e.code}): {err_body}")


def list_bucket_files(base_url, key, bucket, prefix="", all_files=None):
    """Recursively list all files in a bucket."""
    if all_files is None:
        all_files = []

    data = {
        "prefix": prefix,
        "limit": 1000,
        "offset": 0,
    }
    items = supabase_request(base_url, key, f"/object/list/{bucket}", method="POST", data=data)

    for item in items:
        full_path = f"{prefix}{item['name']}" if prefix else item['name']
        if item.get("id") is None:
            # This is a folder, recurse
            list_bucket_files(base_url, key, bucket, f"{full_path}/", all_files)
        else:
            all_files.append(full_path)

    return all_files


def migrate_storage(new_key):
    print_banner("Phase 2 — Storage Bucket Migration")

    print_step(f"Listing files in OLD bucket '{STORAGE_BUCKET}'…")
    try:
        files = list_bucket_files(OLD_SUPABASE_URL, OLD_SUPABASE_KEY, STORAGE_BUCKET)
    except Exception as e:
        print_err(f"Could not list files from old bucket: {e}")
        print_warn("Skipping storage migration. You can re-run later.")
        return

    if not files:
        print_warn("No files found in old storage bucket — skipping")
        return

    print_ok(f"Found {len(files)} files to migrate")

    migrated = 0
    skipped = 0
    errors = 0

    for filepath in files:
        try:
            # Download from old
            file_data = supabase_request(
                OLD_SUPABASE_URL, OLD_SUPABASE_KEY,
                f"/object/{STORAGE_BUCKET}/{filepath}",
                method="GET", binary=True
            )

            # Determine content type
            content_type = "application/octet-stream"
            ext = filepath.rsplit(".", 1)[-1].lower() if "." in filepath else ""
            ct_map = {
                "jpg": "image/jpeg", "jpeg": "image/jpeg",
                "png": "image/png", "gif": "image/gif",
                "webp": "image/webp", "svg": "image/svg+xml",
                "pdf": "application/pdf",
            }
            content_type = ct_map.get(ext, content_type)

            # Upload to new
            upload_url = f"{NEW_SUPABASE_URL}/storage/v1/object/{STORAGE_BUCKET}/{filepath}"
            headers = {
                "apikey": new_key,
                "Authorization": f"Bearer {new_key}",
                "Content-Type": content_type,
                "x-upsert": "true",
            }
            req = urllib.request.Request(upload_url, data=file_data, headers=headers, method="POST")
            resp = urllib.request.urlopen(req)
            resp.read()

            migrated += 1
            print_ok(f"  {filepath} ({len(file_data)} bytes)")

        except Exception as e:
            errors += 1
            print_err(f"  {filepath}: {e}")

    print(f"\n  Storage migration: {migrated} migrated, {skipped} skipped, {errors} errors")


# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    print("\n" + "─" * 60)
    print("  🔄  SUPABASE MIGRATION TOOL")
    print("  Old → New Database & Storage")
    print("─" * 60)

    # Phase 1: Database
    try:
        migrate_database()
    except Exception as e:
        print_err(f"Database migration failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    # Phase 2: Storage
    print("\n")
    new_key = input("Enter the NEW Supabase Service Role Key (or press Enter to skip storage migration): ").strip()
    if new_key:
        global NEW_SUPABASE_KEY
        NEW_SUPABASE_KEY = new_key
        try:
            migrate_storage(new_key)
        except Exception as e:
            print_err(f"Storage migration failed: {e}")
            import traceback
            traceback.print_exc()
    else:
        print_warn("Skipping storage migration")

    print_banner("Migration Complete! 🎉")
    print("  Next steps:")
    print("  1. Update your backend/.env with the new connection strings")
    print("  2. Restart your backend server")
    print("  3. Verify data in the new Supabase dashboard")
    print()


if __name__ == "__main__":
    main()
