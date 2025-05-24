import random

import pandas as pd


# Helper function to process comma‐separated strings (for authors)
def process_list(val):
    """Split a comma-separated string into a list,
    trimming whitespace and filtering out names that start with a non-letter."""
    if pd.isna(val):
        return []
    # Split the string and strip whitespace
    authors = [item.strip() for item in str(val).split(",") if item.strip()]
    # Keep only names that start with a letter (ignores symbols and numbers)
    authors = [author for author in authors if author[0].isalpha()]
    return authors


# Load the datasets
books = pd.read_csv("books_cleaned.csv")
papers = pd.read_csv("papers_cleaned.csv")
# books['Year'] = pd.to_numeric(books['Year'], errors='coerce')
# books = books[books['Year'] >= 1980]
# paper1 = pd.read_csv("cleaned-papers-tech.csv")
# paper2 = pd.read_csv("cleaned-papers-others.csv")
# # Concatenate the two DataFrames and reset the index
# papers = pd.concat([paper1, paper2], ignore_index=True)


# --------------------------------------------------
# 1) Create unique Author list and save to authors_clean.csv
# --------------------------------------------------
# Process the Authors column into lists
books['Authors_list'] = books['Authors'].apply(process_list)
papers['Authors_list'] = papers['Authors'].apply(process_list)

# Build a set of unique authors across both datasets
unique_authors = set()
for authors in books['Authors_list']:
    unique_authors.update(authors)
for authors in papers['Authors_list']:
    unique_authors.update(authors)
unique_authors = sorted(unique_authors)

# Create a DataFrame and assign AuthorID starting at 1
author_df = pd.DataFrame({
    'AuthorID': range(1, len(unique_authors) + 1),
    'Name': unique_authors
})
print("Number of unique authors:", len(unique_authors))
author_df.to_csv("authors_clean.csv", index=False)

# Build a lookup dictionary for later use in PublicationAuthor mapping
author_to_id = {name: aid for aid, name in zip(author_df['AuthorID'], author_df['Name'])}

# --------------------------------------------------
# 2) Generate the Publication dataset (unique publications)
# ID,Title,Authors,Num Authors,ISBN,Year,Field,Categories,Abstract,Book URL,
# Cover URL,Comment,Average Rating,Rating Count,Type --- book
# Title,Authors,Num Authors,Doi,Year,Field,Categories(NULL),Abstract,Links,Comment,Type -- paper
# --------------------------------------------------
# Publication: Title, Year, NumAuthors,
# Abstract, Comment, Field, PublicationURL, Type (field might be joined by diff field)
# For books, group by ID (duplicates differ only in Field)
books_unique = books.groupby("ID", as_index=False).agg({
    'Title': 'first',
    'Year': 'first',
    'Num Authors': 'first',    # will become
    'Abstract': 'first',
    'Book URL': 'first',       # will become PublicationURL
    'Type': 'first',           # should be "Book"
    'Authors_list': 'first',   # same for duplicates
    # Combine all Field values found (if a book appears multiple times with different Field)
    'Field': lambda x: ", ".join(sorted(set(x.dropna())))
})
# Rename Book URL to publication URL
books_unique = books_unique.rename(columns={'Book URL': 'PublicationURL', 'Num Authors': 'NumAuthors'})

# For papers, group by DOI
papers_unique = papers.groupby("Doi", as_index=False).agg({
    'Title': 'first',
    'Year': 'first',
    'Num Authors': 'first',    # will become Num Authors
    'Abstract': 'first',
    'Links': 'first',          # will become Publication URL
    'Type': 'first',           # should be "paper"
    'Authors_list': 'first',
    'Field': lambda x: ", ".join(sorted(set(x.dropna())))
})
papers_unique = papers_unique.rename(columns={'Links': 'PublicationURL', 'Num Authors': 'NumAuthors'})

# Retain the unique key in each for later mapping
# books_unique has ID; papers_unique has Doi

# Combine the two unique publication datasets
publication = pd.concat([books_unique, papers_unique], ignore_index=True, sort=False)

# Assign a new sequential PublicationID (starting at 1)
publication.insert(0, 'PublicationID', range(1, len(publication) + 1))

# Build the final Publication dataset with required columns.
# (The Field column here is the concatenation of all unique fields for that publication.)
publication_df = publication[['PublicationID', 'Title', 'Year', 'NumAuthors', 'Abstract',
                              'Field', 'PublicationURL', 'Type']]
publication_df.to_csv("Publications.csv", index=False)

# --------------------------------------------------
# 3) Update the Book dataset (Book_updated.csv)
#    We need: PublicationID, ISBN, Average Rating, Rating Count, Cover URL
# --------------------------------------------------
# # Get details (assumed identical across duplicates) by grouping by ID
books_details = books.groupby("ID", as_index=False).agg({
    'ISBN': 'first',
    'Average Rating': 'first',
    'Rating Count': 'first',
    'Cover URL': 'first'
})

# For any book entry with Rating Count = 0, replace values with random numbers:
mask = books_details['Rating Count'] == 0
books_details.loc[mask, 'Average Rating'] = books_details.loc[mask, 'Average Rating'].apply(
    lambda x: round(random.uniform(0, 5.0), 2))
books_details.loc[mask, 'Rating Count'] = books_details.loc[mask, 'Rating Count'].apply(
    lambda x: random.randint(1, 100))

# Merge the unique book records (based on ID) with their additional details
books_unique_for_update = books_unique[['ID']].copy()
books_unique_for_update = pd.merge(books_unique_for_update, books_details, on="ID", how="left")
# Get the PublicationID for book publications from the combined publication dataset
books_pub_id = publication.loc[publication['Type'].str.lower() == 'book', ['PublicationID', 'ID']]
books_updated = pd.merge(books_unique_for_update, books_pub_id, on="ID", how="left")
books_updated = books_updated[['PublicationID', 'ISBN', 'Average Rating', 'Rating Count', 'Cover URL']]
books_updated = books_updated.rename(columns={
    'Average Rating': 'AverageRating',
    'Rating Count': 'RatingCount',
    'Cover URL': 'CoverURL'
})
books_updated.to_csv("Book_updated.csv", index=False)


# --------------------------------------------------
# 4) Update the Paper dataset (Paper_updated.csv)
#    We need: PublicationID, Doi
# --------------------------------------------------
papers_updated = papers_unique[['Doi']].copy()
papers_pub_id = publication.loc[publication['Type'].str.lower() == 'paper', ['PublicationID', 'Doi']]
papers_updated = pd.merge(papers_updated, papers_pub_id, on="Doi", how="left")
papers_updated = papers_updated[['PublicationID', 'Doi']]
papers_updated.to_csv("Paper_updated.csv", index=False)

# --------------------------------------------------
# 5) Create PublicationAuthor mapping (PublicationAuthor.csv)
#    Each row: (PublicationID, AuthorID)
# --------------------------------------------------
pub_author_rows = []
# Loop through each publication in the combined dataset.
# We use the Authors_list column from the unique (grouped) record.
for idx, row in publication.iterrows():
    pub_id = row['PublicationID']
    authors = row['Authors_list']
    # Ensure authors is a list (it should be from our earlier processing)
    if isinstance(authors, str):
        authors = process_list(authors)
    for author in authors:
        pub_author_rows.append({'PublicationID': pub_id, 'AuthorID': author_to_id[author]})
pub_author_df = pd.DataFrame(pub_author_rows)

# Remove duplicate (PublicationID, AuthorID) pairs
pub_author_df = pub_author_df.drop_duplicates(subset=['PublicationID', 'AuthorID'])
pub_author_df.to_csv("PublicationAuthor.csv", index=False)

# --------------------------------------------------
# 6) Create PublicationField mapping (PublicationField.csv)
# publication_df = publication[['PublicationID', 'Title', 'Year', 'NumAuthors',
# 'Abstract', 'Field', 'PublicationURL', 'Type']]
# (The Field column here is the concatenation of all unique fields for that publication.)
# --------------------------------------------------
pub_field_rows = []
for _, row in publication_df.iterrows():
    if pd.notna(row["Field"]):
        # Split the Field string by comma and strip whitespace.
        fields = [f.strip() for f in row["Field"].split(",") if f.strip()]
        for field in fields:
            pub_field_rows.append({
                "PublicationID": row["PublicationID"],
                "FieldName": field
            })

# Convert the list of dictionaries to a DataFrame
pub_field_df = pd.DataFrame(pub_field_rows)
pub_field_df = pub_field_df.drop_duplicates(subset=['PublicationID', 'FieldName'])
# Save the PublicationField mapping to CSV
pub_field_df.to_csv("PublicationField.csv", index=False)

print("PublicationFields.csv has been created successfully!")
