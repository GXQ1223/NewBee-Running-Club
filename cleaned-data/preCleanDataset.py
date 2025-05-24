import pandas as pd
import re


# Function to "smart split" the Authors string using regex.
def smart_split_authors(authors_str):
    if pd.isna(authors_str):
        return []
    # Split on comma followed by a space and a capital letter (heuristic)
    tokens = re.split(r',\s+(?=[A-Z])', authors_str)
    return [token.strip() for token in tokens if token.strip()]


# -------------------------
# Clean the books dataset
# -------------------------
def is_valid_authors_entry_books(row):
    expected = row["Num Authors"]
    tokens = smart_split_authors(row["Authors"])
    return len(tokens) == expected


# Read the books dataset
books_df = pd.read_csv("books_drop_duplicate.csv")
books_df = books_df.drop(columns=["Comment"], errors="ignore")
books_df['Year'] = pd.to_numeric(books_df['Year'], errors='coerce')
books_df = books_df.dropna(subset=['Year'])

# Ensure "Num Authors" is numeric
books_df["Num Authors"] = pd.to_numeric(books_df["Num Authors"], errors="coerce")

# Validate the authors format and drop entries with a mismatch
books_df["valid_authors"] = books_df.apply(is_valid_authors_entry_books, axis=1)
clean_books_df = books_df[books_df["valid_authors"]].drop(columns=["valid_authors"])

# Save the cleaned books dataset to CSV
clean_books_df.to_csv("books_cleaned.csv", index=False)
print(f"Cleaned books dataset saved as 'books_cleaned.csv'. Removed {len(books_df) - len(clean_books_df)} entries.")


# -------------------------
# Clean the paper dataset
# -------------------------
def is_valid_authors_entry_papers(row):
    expected = row["Num Authors"]
    tokens = smart_split_authors(row["Authors"])
    return len(tokens) == expected


# Read the papers dataset
paper1 = pd.read_csv("cleaned-papers-tech.csv")
paper2 = pd.read_csv("cleaned-papers-others.csv")
# Concatenate the two DataFrames and reset the index
papers_df = pd.concat([paper1, paper2], ignore_index=True)
# papers_df = pd.read_csv("cleaned-papers-tech.csv")
# papers_df = pd.read_csv("cleaned-papers-others.csv")
# Drop the "Comment" column if it exists.
papers_df = papers_df.drop(columns=["Comment"], errors="ignore")

# Rename "Num_authors" to "Num Authors".
papers_df = papers_df.rename(columns={"Num_authors": "Num Authors"})

# Ensure "Num_authors" is numeric
papers_df["Num Authors"] = pd.to_numeric(papers_df["Num Authors"], errors="coerce")

# Validate the authors format and drop entries with a mismatch
papers_df["valid_authors"] = papers_df.apply(is_valid_authors_entry_papers, axis=1)
clean_papers_df = papers_df[papers_df["valid_authors"]].drop(columns=["valid_authors"])

# Save the cleaned papers dataset to CSV
clean_papers_df.to_csv("papers_cleaned.csv", index=False)
print(f"Cleaned papers dataset saved as 'papers_cleaned.csv'. Removed {len(papers_df) - len(clean_papers_df)} entries.")
