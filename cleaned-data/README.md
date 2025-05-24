cleaned-data description:

- authors_clean.csv: (AuthorID, Name) - import into authors table
	
	This file contains 286,165 unique authors (AuthorID: 1 to 286165). Split and check size of author_list with num_authors, unmatched items have been removed.


- Publications.csv: (PublicationID, Title, Year, NumAuthors, Abstract, Field, PublicationURL, Type) 

	- import into publications table 
	
	This file contains 124,841 unique publication (Type = 'Book' or 'Paper'); with PublicationID from 1 to 124851
	The "Field" column here is the concatenation of all unique fields for that publication, separated by comma;
	PublicationURL is from "Book URL" of the original book dataset or "Links" of the original paper dataset.

- Book_updated.csv: (PublicationID, ISBN, AverageRating, RatingCount, CoverURL) - import into books table
	
	This file contains 48,918 books with PublicationID and book detailed informations 

- Paper_updated.csv: (PublicationID, Doi) - import into papers table

	This file contains (124,841 - 48,918 = 75,923) papers with PublicationID and paper Doi	

- PublicationAuthor.csv: (PublicationID, AuthorID) - import into publicationauthors table

	This file contains 478,915 rows. (duplicates have been removed)

- fields.csv: (FieldName) - import into fields table
	
	This files contains field lists: Healthcare & Biotech, Technology, Industrial & Manufacturing, Financial, Consumer & Retail, Materials & Chemicals, Transportation & Logistics, Telecommunications, Energy & Utilities, Real Estate 

- PublicationField.csv: (PublicationID,FieldName) - import into publicationfield table
	
	This file contains 132,723 rows 

- Stocks.csv: (StockID,Symbol,Region,Field) - import into stocks table

	This file contains 95 different stocks

- StockParameters.csv: (StockID,Date,Year,MarketCap,Volume,Open,Close,High,Low) - import into stockparameters table

	This file contains 118,723 rows

Updated stock cleaned data:

- Stocks_new.csv: (StockID,Symbol,Region,Field) - import into stocks table

	This file contains 103 different stocks

- StockParameters_new.csv: (StockID,Date,Year,MarketCap,Volume,Open,Close,High,Low) - import into stockparameters table

	This file contains 128,931 rows

