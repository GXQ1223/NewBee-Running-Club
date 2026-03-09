#!/usr/bin/env python3
"""
NYRR Race Data Import Tool for NewBee Running Club
Fetches and imports race results from NYRR's API using verified event codes.
Only includes races with confirmed NBRC team participation.

Usage:
    python3 fetch_historical_data.py                    # Import 2015-2025
    python3 fetch_historical_data.py 2023 2024          # Import specific years
    python3 fetch_historical_data.py discover           # Just discover available races
"""
import requests
import pandas as pd
from datetime import datetime
from sqlalchemy.orm import sessionmaker
from database import engine, Results
import io
import time

# Create session
Session = sessionmaker(bind=engine)

# Complete race patterns - working and still testing
RACE_PATTERNS = {
    # ✅ VERIFIED WORKING RACES - Total: 417 NBRC members in 2024
    "BX10M": {  # ✅ CORRECT - 54 NBRC members in 2024
        "name_template": "{year} New Balance Bronx 10M",
        "typical_month": 9,
        "typical_day": 14,
        "distance": "10M"
    },
    "QUEENS": {  # ✅ CORRECT - 58 NBRC members in 2024
        "name_template": "{year} Citizens Queens 10K",
        "typical_month": 6,
        "typical_day": 14,
        "distance": "10K"
    },
    "MINI": {  # ✅ CORRECT - 27 NBRC members in 2024
        "name_template": "{year} Mastercard New York Mini 10K",
        "typical_month": 6,
        "typical_day": 7,
        "distance": "10K"
    },
    "BKH": {  # ✅ CORRECT - 64 NBRC members in 2024 (improved from BH)
        "name_template": "{year} RBC Brooklyn Half",
        "typical_month": 5,
        "typical_day": 17,
        "distance": "Half Marathon"
    },
    "WASH": {  # ✅ CORRECT - 25 NBRC members in 2024
        "name_template": "{year} NYRR Washington Heights Salsa, Blues, and Shamrocks 5K",
        "typical_month": 3,
        "typical_day": 2,
        "distance": "5K"
    },
    "FLHALF": {  # ✅ CORRECT - 26 NBRC members in 2024 (improved from FL)
        "name_template": "{year} NYRR Fred Lebow Half Marathon",
        "typical_month": 1,
        "typical_day": 26,
        "distance": "Half Marathon"
    },
    "JK": {  # ✅ CORRECT - 20 NBRC members in 2024 (improved from JK10K)
        "name_template": "{year} NYRR Joe Kleinerman 10K",
        "typical_month": 1,
        "typical_day": 11,
        "distance": "10K"
    },
    "SIHALF": {  # ✅ CORRECT - 49 NBRC members in 2024
        "name_template": "{year} NYRR Staten Island Half Marathon",
        "typical_month": 10,
        "typical_day": 13,
        "distance": "Half Marathon"
    },
    "TC15K": {  # ✅ CORRECT - 38 NBRC members in 2024
        "name_template": "{year} NYRR Ted Corbitt 15K",
        "typical_month": 12,
        "typical_day": 14,
        "distance": "15K"
    },
    "DASH": {  # ✅ CORRECT - 13 NBRC members in 2024
        "name_template": "{year} Abbott Dash to the Finish Line 5K",
        "typical_month": 11,
        "typical_day": 2,
        "distance": "5K"
    },
    "FAM": {  # ✅ CORRECT - 5th Avenue Mile (24 NBRC members in 2024)
        "name_template": "{year} New Balance 5th Avenue Mile",
        "typical_month": 9,
        "typical_day": 8,
        "distance": "1M"
    },
    "M": {  # ✅ CORRECT - NYC Marathon (93 NBRC members in 2024) - uses M{year} pattern
        "name_template": "{year} TCS New York City Marathon",
        "typical_month": 11,
        "typical_day": 3,
        "distance": "Marathon"
    },
    "H": {  # ✅ CORRECT - United Airlines NYC Half (62 NBRC members in 2024) - uses H{year} pattern
        "name_template": "{year} United Airlines NYC Half",
        "typical_month": 3,
        "typical_day": 16,
        "distance": "Half Marathon"
    },
    "GGG": {  # ✅ CORRECT - Grete's Great Gallop (30 NBRC members in 2024)
        "name_template": "{year} NYRR Grete's Great Gallop 10K",
        "typical_month": 8,
        "typical_day": 23,
        "distance": "10K"
    },
    "TS12": {  # ✅ CORRECT - Training Series 12M (12 NBRC members in 2024)
        "name_template": "{year} TCS New York City Marathon Training Series 12M",
        "typical_month": 8,
        "typical_day": 16,
        "distance": "12M"
    },
    "HARLEM": {  # ✅ CORRECT - 23 NBRC members in 2024 (improved from PSH5K)
        "name_template": "{year} Percy Sutton Harlem 5K",
        "typical_month": 8,
        "typical_day": 9,
        "distance": "5K"
    },
    "CHAMPS5M": {  # ✅ CORRECT - Team Championship 5M (80 NBRC members in 2024)
        "name_template": "{year} NYRR Team Championship 5M",
        "typical_month": 7,
        "typical_day": 27,
        "distance": "5M"
    },
    "RBCKIDS": {  # ✅ CORRECT - 13 NBRC members in 2024 (improved from RK4M)
        "name_template": "{year} RBC Race for the Kids 4M Presented by NYRR",
        "typical_month": 7,
        "typical_day": 12,
        "distance": "4M"
    },
    "HOP": {  # ✅ CORRECT - Achilles Hope & Possibility 4M (19 NBRC members in 2024)
        "name_template": "{year} Achilles Hope & Possibility 4M Presented by TD Bank",
        "typical_month": 6,
        "typical_day": 29,
        "distance": "4M"
    },
    "MIND": {  # ✅ CORRECT - 7 NBRC members in 2024 (improved from MF5K)
        "name_template": "{year} NYRR Mindful 5K",
        "typical_month": 5,
        "typical_day": 3,
        "distance": "5K"
    },
    "RAO4M": {  # ✅ CORRECT - Run as One 4M (19 NBRC members in 2024)
        "name_template": "{year} Run as One 4M Presented by JPMorgan Chase",
        "typical_month": 4,
        "typical_day": 6,
        "distance": "4M"
    },
    "MAN10K": {  # ✅ CORRECT - Manhattan 10K (improved from MN10K)
        "name_template": "{year} NYRR Manhattan 10K",
        "typical_month": 2,
        "typical_day": 2,
        "distance": "10K"
    }
}

def generate_event_code(race_pattern, year):
    """Generate event code for a specific year"""
    # Special patterns that use full year after the code
    if race_pattern in ['M', 'H']:
        return f"{race_pattern}{year}"
    else:
        # Standard pattern: 2-digit year + race code
        year_suffix = str(year)[-2:]  # Get last 2 digits of year
        return f"{year_suffix}{race_pattern}"

def generate_race_config(race_pattern, race_info, year):
    """Generate race configuration for a specific year"""
    return {
        "name": race_info["name_template"].format(year=year),
        "date": datetime(year, race_info["typical_month"], race_info["typical_day"], 8, 0),
        "distance": race_info["distance"]
    }

def test_event_code_exists(event_code, team_code="NBRC"):
    """Test if an event code has data available"""
    url = "https://rmsprodapi.nyrr.org/api/v2/report/team-runners"
    params = {
        "eventCode": event_code,
        "teamCode": team_code,
        "format": "excel"
    }

    try:
        response = requests.get(url, params=params, timeout=10)
        return response.status_code == 200 and len(response.content) > 1000
    except Exception as e:
        print(f"Error testing event code {event_code}: {e}")
        return False

def discover_available_races(start_year=2015, end_year=2025, team_code="NBRC"):
    """Discover which race/year combinations have data available"""
    print(f"🔍 Discovering available races from {start_year} to {end_year}...")

    available_races = {}

    for year in range(start_year, end_year + 1):
        print(f"\n--- Testing {year} ---")
        year_races = []

        for race_pattern, race_info in RACE_PATTERNS.items():
            event_code = generate_event_code(race_pattern, year)

            print(f"Testing {event_code}...", end=" ")

            if test_event_code_exists(event_code, team_code):
                print("✅ Available")
                race_config = generate_race_config(race_pattern, race_info, year)
                year_races.append({
                    "event_code": event_code,
                    "race_pattern": race_pattern,
                    "config": race_config
                })
            else:
                print("❌ No data")

            # Add small delay between API calls to be respectful
            time.sleep(0.5)

        if year_races:
            available_races[year] = year_races

    return available_races

def fetch_race_data(event_code, team_code="NBRC"):
    """Fetch race data from NYRR API"""
    url = "https://rmsprodapi.nyrr.org/api/v2/report/team-runners"
    params = {
        "eventCode": event_code,
        "teamCode": team_code,
        "format": "excel"
    }

    try:
        print(f"Fetching data for {event_code}...")
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()

        # Read Excel data from response
        excel_data = pd.read_excel(io.BytesIO(response.content))
        return excel_data

    except Exception as e:
        print(f"Error fetching data for {event_code}: {e}")
        return None

def clean_percentage(value):
    """Remove % symbol and convert to decimal"""
    if isinstance(value, str) and value.strip().endswith('%'):
        return float(value.strip().rstrip('%'))
    return None

def import_race_data(event_code, config, df):
    """Import race data to database"""
    session = Session()
    imported_count = 0

    try:
        for index, row in df.iterrows():
            if pd.isna(row.iloc[0]) or not str(row.iloc[0]).strip():
                continue

            try:
                name = str(row.iloc[4]).strip() if pd.notna(row.iloc[4]) else "Unknown"
                bib = str(row.iloc[3]).strip() if pd.notna(row.iloc[3]) else None

                # Check if record already exists
                existing_result = session.query(Results).filter_by(
                    name=name,
                    bib=bib,
                    race=config["name"]
                ).first()

                if existing_result:
                    # Update existing record
                    existing_result.overall_place = int(row.iloc[0]) if pd.notna(row.iloc[0]) else None
                    existing_result.gender_place = int(row.iloc[1]) if pd.notna(row.iloc[1]) else None
                    existing_result.age_group_place = int(row.iloc[2]) if pd.notna(row.iloc[2]) else None
                    existing_result.gender_age = str(row.iloc[5]).strip() if pd.notna(row.iloc[5]) else None
                    existing_result.iaaf = str(row.iloc[6]).strip() if pd.notna(row.iloc[6]) else None
                    existing_result.overall_time = str(row.iloc[7]).strip() if pd.notna(row.iloc[7]) else None
                    existing_result.pace = str(row.iloc[8]).strip() if pd.notna(row.iloc[8]) else None
                    existing_result.gun_time = str(row.iloc[9]).strip() if pd.notna(row.iloc[9]) else None
                    existing_result.age_graded_time = str(row.iloc[10]).strip() if pd.notna(row.iloc[10]) else None
                    existing_result.age_graded_place = int(row.iloc[12]) if pd.notna(row.iloc[12]) else None
                    existing_result.age_graded_percent = clean_percentage(str(row.iloc[14])) if pd.notna(row.iloc[14]) else None
                    existing_result.race_time = config["date"]
                    existing_result.race_distance = config["distance"]
                else:
                    # Create new record
                    result = Results(
                        overall_place=int(row.iloc[0]) if pd.notna(row.iloc[0]) else None,
                        gender_place=int(row.iloc[1]) if pd.notna(row.iloc[1]) else None,
                        age_group_place=int(row.iloc[2]) if pd.notna(row.iloc[2]) else None,
                        bib=bib,
                        name=name,
                        gender_age=str(row.iloc[5]).strip() if pd.notna(row.iloc[5]) else None,
                        iaaf=str(row.iloc[6]).strip() if pd.notna(row.iloc[6]) else None,
                        overall_time=str(row.iloc[7]).strip() if pd.notna(row.iloc[7]) else None,
                        pace=str(row.iloc[8]).strip() if pd.notna(row.iloc[8]) else None,
                        gun_time=str(row.iloc[9]).strip() if pd.notna(row.iloc[9]) else None,
                        age_graded_time=str(row.iloc[10]).strip() if pd.notna(row.iloc[10]) else None,
                        age_graded_place=int(row.iloc[12]) if pd.notna(row.iloc[12]) else None,
                        age_graded_percent=clean_percentage(str(row.iloc[14])) if pd.notna(row.iloc[14]) else None,
                        race=config["name"],
                        race_time=config["date"],
                        race_distance=config["distance"]
                    )
                    session.add(result)

                imported_count += 1

            except Exception as e:
                print(f"Error processing row {index}: {e}")
                continue

        session.commit()
        print(f"✅ Imported {imported_count} records for {config['name']}")
        return imported_count

    except Exception as e:
        session.rollback()
        print(f"❌ Error importing data: {e}")
        return 0
    finally:
        session.close()

def fetch_all_available_data(start_year=2015, end_year=2025):
    """Discover and fetch all available race data"""
    # First, discover what's available
    available_races = discover_available_races(start_year, end_year)

    if not available_races:
        print("❌ No available races found!")
        return

    print(f"\n🎉 Found races in {len(available_races)} years")

    # Show summary
    total_races = sum(len(races) for races in available_races.values())
    print(f"📊 Total races available: {total_races}")

    # Automatically proceed with import
    print(f"\n🚀 Starting import of all {total_races} races...")

    # Import all available data
    total_imported = 0

    for year, races in available_races.items():
        print(f"\n=== Importing {year} races ===")

        for race_info in races:
            event_code = race_info["event_code"]
            config = race_info["config"]

            # Fetch data
            df = fetch_race_data(event_code)
            if df is not None:
                count = import_race_data(event_code, config, df)
                total_imported += count
            else:
                print(f"❌ Failed to fetch {event_code}")

            # Add small delay between imports to be respectful
            time.sleep(1.0)

    print(f"\n🎉 Total records imported: {total_imported}")

if __name__ == "__main__":
    import sys

    if len(sys.argv) >= 3:
        # Custom year range
        start_year = int(sys.argv[1])
        end_year = int(sys.argv[2])
        print(f"🚀 Fetching data from {start_year} to {end_year}")
        fetch_all_available_data(start_year, end_year)
    elif len(sys.argv) == 2 and sys.argv[1] == "discover":
        # Just discover, don't import
        available = discover_available_races(2015, 2025)
        print(f"\n📋 Available races summary:")
        for year, races in available.items():
            print(f"{year}: {len(races)} races")
    else:
        # Default: last 10 years
        print("🚀 Fetching data for last 10 years (2015-2025)")
        fetch_all_available_data(2015, 2025)