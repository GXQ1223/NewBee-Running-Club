const { Pool, types } = require('pg');
const config = require('./config.json')

// Override the default parsing for BIGINT (PostgreSQL type ID 20)
types.setTypeParser(20, val => parseInt(val, 10)); //DO NOT DELETE THIS

// Create PostgreSQL connection using database credentials provided in config.json
// Do not edit. If the connection fails, make sure to check that config.json is filled out correctly
const connection = new Pool({
  host: config.rds_host,
  user: config.rds_user,
  password: config.rds_password,
  port: config.rds_port,
  database: config.rds_db,
  ssl: {
    rejectUnauthorized: false,
  },
});
connection.connect((err) => err && console.log(err));



/******************************
 * Home page related ROUTES *
 ******************************/
// GET /randombook
const random_book = async function (req, res) {
  // fetch a random book from Publications
  const query = `
      SELECT PublicationID, Title, PublicationURL, Type
      FROM Publications
      WHERE Type = 'Book'
      ORDER BY RANDOM()
      LIMIT 1;
  `;

  connection.query(query, (err, data) => {
      if (err) {
          console.log(err); 
          res.json({}); 
      } else {
          if (data.rows.length > 0) {
              res.json({
                  publication_id: data.rows[0].publicationid,
                  title: data.rows[0].title,
                  publication_url: data.rows[0].publicationurl,
                  type: data.rows[0].type
              });
          } else {
              res.json({ message: "No books found" });
          }
      }
  });
};

// Helper function for pagination
const getPagination = (page = 1, limit = 10) => {
  const offset = (parseInt(page) - 1) * parseInt(limit);
  return { limit: parseInt(limit), offset };
};

// Route: GET /home/top-stocks
// This route returns the top stocks by market capitalization (based on lastest available data)
const top_stocks = (req, res) => {
  const field = req.query.field ?? null;
  const page = req.query.page ?? 1;
  const limit = req.query.limit ?? 5;
  const { offset } = getPagination(page, limit);

  let query = `
      SELECT s.StockID, s.Symbol, s.Region, s.Field, sp.MarketCap
      FROM Stocks s
      JOIN StockParameters sp ON s.StockID = sp.StockID
      WHERE sp.Date = (
          SELECT MAX(Date) FROM StockParameters WHERE StockID = s.StockID
      )
  `;

  const params = [];
  let paramIndex = 1;

  if (field) {
      query += ` AND s.Field = $${paramIndex++}`;
      params.push(field);
  }

  query += ` ORDER BY sp.MarketCap DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
  params.push(limit, offset);

  connection.query(query, params, (err, data) => {
      if (err) {
          console.error('Error fetching top stocks:', err);
          res.status(500).json({ message: "Internal Server Error" });
      } else {
          res.json(data.rows);
      }
  });
};


// Route: GET /home/latest-papers
const latest_papers = (req, res) => {
  const field = req.query.field ?? null;
  const page = req.query.page ?? 1;
  const limit = req.query.limit ?? 5;
  const { offset } = getPagination(page, limit);

  let query = `
      SELECT distinct p.PublicationID, p.Title, p.Year, p.Type, f.FieldName, r.DOI
      FROM Publications p
      JOIN PublicationFields pf ON p.PublicationID = pf.PublicationID
      JOIN Fields f ON pf.FieldName = f.FieldName
      JOIN Papers r ON p.PublicationID = r.PublicationID
      WHERE p.Type = 'Paper'
  `;

  const params = [];
  let paramIndex = 1;

  if (field) {
      query += ` AND f.FieldName = $${paramIndex++}`;
      params.push(field);
  }

  query += ` ORDER BY p.Year DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
  params.push(limit, offset);

  connection.query(query, params, (err, data) => {
      if (err) {
          console.error('Error fetching latest papers:', err);
          res.status(500).json({ message: "Internal Server Error" });
      } else {
          res.json(data.rows);
      }
  });
};


// Route: GET /home/top-rated-books
const top_rated_books = (req, res) => {
  const field = req.query.field ?? null;
  const page = req.query.page ?? 1;
  const limit = req.query.limit ?? 5;
  const { offset } = getPagination(page, limit);

  let query = `
      SELECT distinct p.PublicationID, p.Title, p.Year, f.FieldName, b.ISBN, b.AverageRating
      FROM Publications p
      JOIN PublicationFields pf ON p.PublicationID = pf.PublicationID
      JOIN Fields f ON pf.FieldName = f.FieldName
      JOIN Books b ON p.PublicationID = b.PublicationID
      WHERE p.Type = 'Book'
  `;

  const params = [];
  let paramIndex = 1;

  if (field) {
      query += ` AND f.FieldName = $${paramIndex++}`;
      params.push(field);
  }

  query += ` ORDER BY b.AverageRating DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
  params.push(limit, offset);

  connection.query(query, params, (err, data) => {
      if (err) {
          console.error('Error fetching top-rated books:', err);
          res.status(500).json({ message: "Internal Server Error" });
      } else {
          res.json(data.rows);
      }
  });
};



/***********************************
 * Publication page related ROUTES *
 ***********************************/

// Route: GET /publications/:publication_id
// This route returns the details of a publication based on its publication_id
const publication_details = function (req, res) {
  const publicationId = req.params.publication_id;

  const query = `
      SELECT p.PublicationID, p.Title, p.Year, p.Abstract, 
             p.PublicationURL, p.Type, 
             ARRAY_AGG(f.FieldName) as fields
      FROM Publications p
      LEFT JOIN PublicationFields pf ON p.PublicationID = pf.PublicationID
      LEFT JOIN Fields f ON pf.FieldName = f.FieldName
      WHERE p.PublicationID = $1
      GROUP BY p.PublicationID, p.Title, p.Year, p.Abstract, p.PublicationURL, p.Type;
  `;

  connection.query(query, [publicationId], (err, data) => {
    if (err) {
      console.log(err); 
      res.status(500).json({ message: "Internal Server Error" });
    } else if (data.rows.length === 0) {
      res.status(404).json({ message: "Publication not found" });
    } else {
      let publication = data.rows[0];
      let response = {
        publication_id: publication.publicationid,
        title: publication.title,
        year: publication.year,
        // num_authors: publication.numauthors,
        abstract: publication.abstract,
        fields: publication.fields,
        publication_url: publication.publicationurl,
        type: publication.type,
        isbn: null,
        average_rating: null,
        rating_count: null,
        cover_url: null, 
        doi: null,
        authors: []
      };

      // Fetch authors
      const authorsQuery = `
        SELECT a.AuthorID, a.Name
        FROM PublicationAuthors pa
        JOIN Authors a ON pa.AuthorID = a.AuthorID
        WHERE pa.PublicationID = $1;
      `;

      connection.query(authorsQuery, [publicationId], (authorErr, authorData) => {
        if (!authorErr) {
          response.authors = authorData.rows.map(row => ({
            author_id: row.authorid,
            name: row.name
          }));
        }

        // Book-specific data
        if (publication.type.toLowerCase() === 'book') {
          const bookQuery = `
              SELECT ISBN, AverageRating, RatingCount, CoverURL
              FROM Books
              WHERE PublicationID = $1;
          `;
          connection.query(bookQuery, [publicationId], (bookErr, bookData) => {
            if (!bookErr && bookData.rows.length > 0) {
              response.isbn = bookData.rows[0].isbn;
              response.average_rating = bookData.rows[0].averagerating;
              response.rating_count = bookData.rows[0].ratingcount;
              response.cover_url = bookData.rows[0].coverurl;
            }
            res.json(response);
          });
        }

        // Paper-specific data
        else if (publication.type.toLowerCase() === 'paper') {
          const paperQuery = `
              SELECT DOI
              FROM Papers
              WHERE PublicationID = $1;
          `;
          connection.query(paperQuery, [publicationId], (paperErr, paperData) => {
            if (!paperErr && paperData.rows.length > 0) {
              response.doi = paperData.rows[0].doi;
            }
            res.json(response);
          });
        } else {
          // Other types
          res.json(response);
        }
      });
    }
  });
};

// Route 4: GET /stocks/:stock_symbol/publications
// Returns 5 most recent books and 5 most recent papers associated with a specific stock
const stock_publications = async function (req, res) {
  const stockSymbol = req.params.stock_symbol;

  // SQL query to fetch 5 top books and 5 top papers linked to a specific stock
  const query = `
    (
      -- Top 5 books related to the stock
      SELECT p.PublicationID, p.Title, p.Year, p.Type
      FROM Publications p
      JOIN PublicationFields pf ON p.PublicationID = pf.PublicationID
      JOIN Stocks s ON pf.FieldName = s.Field
      WHERE s.Symbol = $1 AND p.Type = 'Book'
      ORDER BY p.Year DESC, p.Title
      LIMIT 5
    )
    UNION ALL
    (
      -- Top 5 papers related to the stock
      SELECT p.PublicationID, p.Title, p.Year, p.Type
      FROM Publications p
      JOIN PublicationFields pf ON p.PublicationID = pf.PublicationID
      JOIN Stocks s ON pf.FieldName = s.Field
      WHERE s.Symbol = $1 AND p.Type = 'Paper'
      ORDER BY p.Year DESC, p.Title
      LIMIT 5
    )
    ORDER BY Type, Year DESC;
  `;

  try {
    const result = await connection.query(query, [stockSymbol]);
    
    // Transform the result rows to match your API format
    const publications = result.rows.map(row => ({
      publication_id: row.publicationid,
      title: row.title,
      year: row.year,
      type: row.type
    }));
    
    res.json(publications);
  } catch (err) {
    console.error("Error fetching publications for stock:", err);
    res.status(500).json({ 
      message: "Internal Server Error", 
      error: err.message 
    });
  }
};





// Route: GET /publications/search
// This route returns a list of publications based on the search criteria
const publication_search = async function (req, res) {
  const title = req.query.title ?? '';
  const field = req.query.field ?? null;
  const startYear = req.query.start_year ?? 1900;
  const endYear = req.query.end_year ?? 2100;
  const type = req.query.type ?? null;
  const minRating = req.query.min_rating ?? null;
  const maxRating = req.query.max_rating ?? null;
  const isbn = req.query.isbn ?? null;

  try {
    let query = `
      SELECT DISTINCT p.PublicationID as publicationid, p.Title as title, p.Year as year, p.Type as type,
             b.ISBN as isbn, b.AverageRating as averagerating, r.DOI as doi
      FROM Publications p
      JOIN PublicationFields pf ON p.PublicationID = pf.PublicationID
      JOIN Fields f ON pf.FieldName = f.FieldName
      LEFT JOIN Books b ON p.PublicationID = b.PublicationID
      LEFT JOIN Papers r ON p.PublicationID = r.PublicationID
      WHERE p.Title ILIKE $1
        AND p.Year BETWEEN $2 AND $3
    `;

    let queryParams = [`%${title}%`, startYear, endYear];
    let paramIndex = 4;

    if (field) {
      query += ` AND f.FieldName = $${paramIndex}`;
      queryParams.push(field);
      paramIndex++;
    }

    if (type) {
      query += ` AND p.Type ILIKE $${paramIndex}`;
      queryParams.push(type);
      paramIndex++;
    }

    // Apply book-only filters
    if (type === 'book') {
      if (isbn) {
        query += ` AND b.ISBN = $${paramIndex}`;
        queryParams.push(isbn);
        paramIndex++;
      }
      if (minRating) {
        query += ` AND b.AverageRating >= $${paramIndex}`;
        queryParams.push(minRating);
        paramIndex++;
      }
      if (maxRating) {
        query += ` AND b.AverageRating <= $${paramIndex}`;
        queryParams.push(maxRating);
        paramIndex++;
      }
    }

    query += ` ORDER BY p.Year DESC;`;

    console.log("Executing SQL Query:", query);
    console.log("With Parameters:", queryParams);

    const result = await connection.query(query, queryParams);
    res.json(result.rows);
  } catch (err) {
    console.error("Error executing search:", err);
    res.status(500).json({ message: 'Internal Server Error', error: err.message });
  }
};





/******************************
 * Author page related ROUTES *
 ******************************/

// Route3: GET /authors/top-productive
// This route returns the top 10 most productive authors in the last 10 years
const top_productive_authors = async function (req, res) {
  const query = `
      WITH recent_publications AS (
          SELECT PublicationID
          FROM Publications
          WHERE Year >= EXTRACT(YEAR FROM CURRENT_DATE) - 10
      )
      SELECT 
          a.AuthorID AS author_id,
          a.Name AS author_name,
          COUNT(DISTINCT pa.PublicationID) AS publication_count
      FROM Authors a
      JOIN PublicationAuthors pa ON a.AuthorID = pa.AuthorID
      JOIN recent_publications rp ON pa.PublicationID = rp.PublicationID
      GROUP BY a.AuthorID, a.Name
      ORDER BY publication_count DESC
      LIMIT 10;
  `;

  try {
    const result = await connection.query(query);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        message: "No authors found with publications in the last 10 years" 
      });
    }

    const authorsData = result.rows.map(row => ({
      author_id: row.author_id,
      author_name: row.author_name,
      publication_count: parseInt(row.publication_count, 10)
    }));
    
    res.json(authorsData);
  } catch (err) {
    console.error("Error fetching top productive authors:", err);
    res.status(500).json({ 
      message: "Internal Server Error", 
      error: err.message 
    });
  }
};



// Route 6: GET /authors/:author_id/publications  
// This route returns all publications for a given author with all necessary details
const author_publications = async function (req, res) {
  const authorId = req.params.author_id;

  const query = `
    WITH author_pubs AS (
      SELECT p.PublicationID, p.title, p.Year, p.Type, p.PublicationURL, a.Name AS AuthorName
      FROM Publications p
      JOIN PublicationAuthors pa ON p.PublicationID = pa.PublicationID
      JOIN Authors a ON pa.AuthorID = a.AuthorID
      WHERE pa.AuthorID = $1
    )
    SELECT 
      ap.*,
      b.ISBN, b.AverageRating, b.RatingCount, b.CoverURL,
      r.DOI
    FROM author_pubs ap
    LEFT JOIN Books b ON ap.PublicationID = b.PublicationID
    LEFT JOIN Papers r ON ap.PublicationID = r.PublicationID
    ORDER BY ap.Year DESC;
  `;

  try {
    const result = await connection.query(query, [authorId]);

    res.json(result.rows.map(row => ({
      publication_id: row.publicationid,
      title: row.title,
      year: row.year,
      type: row.type,
      // field: row.field,
      publication_url: row.publicationurl,
      // abstract: row.abstract,
      // num_authors: row.numauthors,
      author_name: row.authorname,
      isbn: row.isbn,
      average_rating: row.averagerating,
      rating_count: row.ratingcount,
      cover_url: row.coverurl,
      doi: row.doi
    })));
  } catch (err) {
    console.error('Error fetching author publications:', err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Route 7: GET /authors/:author_id/network'
// This route returns the top 10 co-authors for a given author
const author_network = async function (req, res) {
  const authorId = req.params.author_id;

  // SQL query to fetch top 10 co-authors for the given author
  const query = `
      SELECT A1.AuthorID AS AuthorID, A1.Name AS AuthorName,
             A2.AuthorID AS CoAuthorID, A2.Name AS CoAuthorName,
             COUNT(*) AS CoAuthCount
      FROM PublicationAuthors PA1
      JOIN PublicationAuthors PA2 ON PA1.PublicationID = PA2.PublicationID
      JOIN Authors A1 ON PA1.AuthorID = A1.AuthorID
      JOIN Authors A2 ON PA2.AuthorID = A2.AuthorID
      WHERE PA1.AuthorID = ${authorId} AND PA2.AuthorID <> ${authorId}
      GROUP BY A1.AuthorID, A1.Name, A2.AuthorID, A2.Name
      ORDER BY CoAuthCount DESC
      LIMIT 10;
  `;

  connection.query(query, (err, data) => {
      if (err) {
          console.log(err); 
          res.json([]); 
      } else {
          res.json(data.rows.map(row => ({
              author_id: row.authorid,
              author_name: row.authorname,
              co_author_id: row.coauthorid,
              co_author_name: row.coauthorname,
              co_auth_count: row.coauthcount
          })));
      }
  });
};

// Route 8: GET /authors/:author_id/timeline'
// This route returns the author's publication history year by year
const author_timeline = async function (req, res) {
  const authorId = req.params.author_id;

  // fetch publication count per year for the given author
  const query = `
      SELECT A.AuthorID, A.Name, P.Year, COUNT(*) AS PublicationCount
      FROM Publications P
      JOIN PublicationAuthors PA ON P.PublicationID = PA.PublicationID
      JOIN Authors A ON PA.AuthorID = A.AuthorID
      WHERE PA.AuthorID = ${authorId}
      GROUP BY A.AuthorID, A.Name, P.Year
      ORDER BY P.Year DESC;
  `;

  connection.query(query, (err, data) => {
      if (err) {
          console.log(err); 
          res.json([]); 
      } else {
          res.json(data.rows.map(row => ({
              author_id: row.authorid,
              author_name: row.name,
              year: row.year,
              publication_count: row.publicationcount
          })));
      }
  });
};

// Route: GET /authors/:author_id/fields
// This route returns the unique fields of publications for a given author
const author_fields = async function (req, res) {
  const authorId = req.params.author_id;

  const query = `
      SELECT DISTINCT f.FieldName
      FROM Fields f
      JOIN PublicationFields pf ON f.FieldName = pf.FieldName
      JOIN Publications p ON pf.PublicationID = p.PublicationID
      JOIN PublicationAuthors pa ON p.PublicationID = pa.PublicationID
      WHERE pa.AuthorID = ${authorId}
      ORDER BY f.FieldName;
  `;

  connection.query(query, (err, data) => {
      if (err) {
          console.log(err); 
          res.json([]); 
      } else {
          res.json(data.rows.map(row => row.fieldname));
      }
  });
};

// Route12: GET /authors/top-collaborations
// This endpoint returns the top 10 author collaborations based on the optimized Query 12
const top_author_collaborations = async (req, res) => {
  const query = `
    WITH PotentialCollaborators AS (
      -- First find authors who have enough publications to likely be in top collaborations
      SELECT pa.AuthorID
      FROM PublicationAuthors pa
      GROUP BY pa.AuthorID
      HAVING COUNT(DISTINCT pa.PublicationID) > 5
      ORDER BY COUNT(DISTINCT pa.PublicationID) DESC
      LIMIT 1000
    ),
    CollaborationPairs AS (
      -- Now only analyze collaborations between these authors
      SELECT
          LEAST(pa1.AuthorID, pa2.AuthorID) AS Author1_ID,
          GREATEST(pa1.AuthorID, pa2.AuthorID) AS Author2_ID,
          COUNT(DISTINCT pa1.PublicationID) AS CollaborationCount
      FROM PublicationAuthors pa1
      JOIN PublicationAuthors pa2
          ON pa1.PublicationID = pa2.PublicationID
          AND pa1.AuthorID != pa2.AuthorID
      WHERE pa1.AuthorID IN (SELECT AuthorID FROM PotentialCollaborators)
        AND pa2.AuthorID IN (SELECT AuthorID FROM PotentialCollaborators)
      GROUP BY
          LEAST(pa1.AuthorID, pa2.AuthorID),
          GREATEST(pa1.AuthorID, pa2.AuthorID)
    )
    SELECT
       cp.Author1_ID,
       a1.Name AS Author1_Name,
       cp.Author2_ID,
       a2.Name AS Author2_Name,
       cp.CollaborationCount
    FROM CollaborationPairs cp
    JOIN Authors a1 ON cp.Author1_ID = a1.AuthorID
    JOIN Authors a2 ON cp.Author2_ID = a2.AuthorID
    ORDER BY cp.CollaborationCount DESC, cp.Author1_ID, cp.Author2_ID
    LIMIT 30;
  `;

  try {
    const result = await connection.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching top author collaborations:", err);
    res.status(500).json({ message: "Internal Server Error", error: err.message });
  }
};


/******************************
 * Stock-related ROUTES *
 ******************************/
// Route 9a: GET /stocks/:field/performance?start_date=DD/MM/YYYY&end_date=DD/MM/YYYY
// This route returns average closing price and volume for stocks in a specified field over a custom date range
const stock_field_performance = async function (req, res) {
  const field = req.params.field; // Get the field from the URL parameter
  const startDate = req.query.start_date || '01/01/2023'; // Default to Jan 1, 2023
  const endDate = req.query.end_date || '31/12/2023';     // Default to Dec 31, 2023

  // Basic validation for date format (DD/MM/YYYY)
  const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
  if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
    return res.status(400).json({ 
      message: "Invalid date format. Use DD/MM/YYYY (e.g., 01/01/2023)" 
    });
  }

  const query = `
      SELECT 
        s.StockID,
        s.Symbol,
        s.Region,
        s.Field,
        AVG(sp.Open) AS AvgOpenPrice,
        AVG(sp.Close) AS AvgClosePrice,
        AVG(sp.High) AS AvgHighPrice,
        AVG(sp.Low) AS AvgLowPrice,
        AVG(sp.Volume) AS AvgVolume,
        AVG(sp.MarketCap) AS AvgMarketCap,
        MIN(sp.Date) AS EarliestDate,
        MAX(sp.Date) AS LatestDate,
        COUNT(*) AS TradingDays
      FROM Stocks s
      JOIN StockParameters sp ON s.StockID = sp.StockID
      WHERE LOWER(s.Field) = LOWER($1)
      AND sp.Date BETWEEN TO_DATE($2, 'DD/MM/YYYY') 
      AND TO_DATE($3, 'DD/MM/YYYY')
      GROUP BY 
        s.StockID,
        s.Symbol,
        s.Region,
        s.Field
        ORDER BY (CASE WHEN s.Region = 'US' THEN 0 ELSE 1 END), AVG(sp.MarketCap) DESC;
  `;

  try {
    const result = await connection.query(query, [field, startDate, endDate]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        message: `No stocks found in the ${field} field between ${startDate} and ${endDate}` 
      });
    }

    const performanceData = result.rows.map(row => ({
      stock_id: row.stockid,
      symbol: row.symbol,
      region: row.region,
      field: row.field,
      avg_open_price: parseFloat(row.avgopenprice).toFixed(2),
      avg_close_price: parseFloat(row.avgcloseprice).toFixed(2),
      avg_high_price: parseFloat(row.avghighprice).toFixed(2),
      avg_low_price: parseFloat(row.avglowprice).toFixed(2),
      avg_volume: Math.round(row.avgvolume),
      avg_market_cap: parseFloat(row.avgmarketcap).toFixed(2),
      earliest_date: row.earliestdate.toISOString().split('T')[0], // Format as YYYY-MM-DD
      latest_date: row.latestdate.toISOString().split('T')[0],     // Format as YYYY-MM-DD
      avg_year: Math.round(row.avgyear),                           // Round to nearest integer
      trading_days: row.tradingdays
    }));
    
    res.json(performanceData);
  } catch (err) {
    console.error(`Error fetching ${field} stock performance:`, err);
    res.status(500).json({ 
      message: "Internal Server Error", 
      error: err.message 
    });
  }
};



// Route9b: GET /stocks/fields
// This route returns all unique fields from the Stocks table
const stock_fields = async function (req, res) {
  const query = `
      SELECT DISTINCT field AS FieldName
      FROM Stocks
      WHERE field IS NOT NULL
      ORDER BY field ASC;
  `;

  try {
    const result = await connection.query(query);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No fields found in the Stocks table" });
    }

    const fields = result.rows.map(row => row.fieldname);
    res.json(fields);
  } catch (err) {
    console.error("Error fetching stock fields:", err);
    res.status(500).json({ 
      message: "Internal Server Error", 
      error: err.message 
    });
  }
};

// Route10a: GET /stocks/top-daytrader
const top_daytrader_stocks = async function (req, res) {
  const query = `
    WITH GoodDayStats AS (
        SELECT
            sp.StockID,
            sp.Date,
            (sp.Close - sp.Open) / sp.Open * 100 AS GrowthRate
        FROM StockParameters sp
        WHERE sp.Close > sp.Open
    ),
    AggregatedStats AS (
        SELECT
            s.StockID,
            s.Symbol,
            s.Field,
            COUNT(gds.Date) AS GoodDays,
            COUNT(sp.Date) AS TotalDays,
            ROUND(100.0 * COUNT(gds.Date) / COUNT(sp.Date), 2) AS SuccessRate,
            ROUND(AVG(gds.GrowthRate), 2) AS AvgGrowthRateOnGoodDays,
            MAX(gds.GrowthRate) AS MaxGrowthRate
        FROM Stocks s
        JOIN StockParameters sp ON s.StockID = sp.StockID
        LEFT JOIN GoodDayStats gds ON sp.StockID = gds.StockID AND sp.Date = gds.Date
        GROUP BY s.StockID, s.Symbol, s.Field
    ),
    BestDayPerStock AS (
        SELECT DISTINCT ON (gds.StockID)
            gds.StockID,
            gds.Date AS BestDay
        FROM GoodDayStats gds
        JOIN (
            SELECT StockID, MAX(GrowthRate) AS MaxRate
            FROM GoodDayStats
            GROUP BY StockID
        ) max_gds ON gds.StockID = max_gds.StockID AND gds.GrowthRate = max_gds.MaxRate
    )
    SELECT
        a.Field AS stock_field,
        a.StockID,
        a.Symbol,
        a.GoodDays,
        a.TotalDays,
        a.SuccessRate,
        a.AvgGrowthRateOnGoodDays,
        b.BestDay,
        ROUND(a.MaxGrowthRate, 2) AS MaxGrowthRate
    FROM AggregatedStats a
    LEFT JOIN BestDayPerStock b ON a.StockID = b.StockID
    ORDER BY a.GoodDays DESC
    LIMIT 10;
  `;

  try {
    const result = await connection.query(query);
    const stocks = result.rows.map(row => ({
      field: row.stock_field,  // New property
      symbol: row.symbol,
      good_days: row.gooddays,
      total_days: row.totaldays,
      success_rate: row.successrate,
      avg_growth_rate_on_good_days: row.avggrowthrateongooddays,
      best_day: row.bestday ? row.bestday.toISOString().split('T')[0] : null,
      max_growth_rate: row.maxgrowthrate
    }));
    res.json(stocks);
  } catch (err) {
    console.error("Error fetching top day trader stocks:", err);
    res.status(500).json({ message: "Internal Server Error", error: err.message });
  }
};

// Route10b: GET /stocks/worst-daytrader
// This endpoint returns the 10 stocks with the highest failure rate (most bad days)
// In these days, the close price is lower than the open price.
const worst_daytrader_stocks = async function (req, res) {
  const query = `
    WITH BadDayStats AS (
        SELECT
            sp.StockID,
            sp.Date,
            (sp.Close - sp.Open) / sp.Open * 100 AS DeclineRate
        FROM StockParameters sp
        WHERE sp.Close < sp.Open
    ),
    AggregatedStats AS (
        SELECT
            s.StockID,
            s.Symbol,
            s.Field,
            COUNT(bds.Date) AS BadDays,
            COUNT(sp.Date) AS TotalDays,
            ROUND(100.0 * COUNT(bds.Date) / COUNT(sp.Date), 2) AS FailureRate,
            ROUND(AVG(bds.DeclineRate), 2) AS AvgDeclineOnBadDays,
            MIN(bds.DeclineRate) AS MinDeclineRate
        FROM Stocks s
        JOIN StockParameters sp ON s.StockID = sp.StockID
        LEFT JOIN BadDayStats bds ON sp.StockID = bds.StockID AND sp.Date = bds.Date
        GROUP BY s.StockID, s.Symbol, s.Field
    ),
    WorstDayPerStock AS (
        SELECT DISTINCT ON (bds.StockID)
            bds.StockID,
            bds.Date AS WorstDay
        FROM BadDayStats bds
        JOIN (
            SELECT StockID, MIN(DeclineRate) AS MinRate
            FROM BadDayStats
            GROUP BY StockID
        ) min_bds ON bds.StockID = min_bds.StockID AND bds.DeclineRate = min_bds.MinRate
    )
    SELECT
        a.Field AS stock_field,
        a.StockID,
        a.Symbol,
        a.BadDays,
        a.TotalDays,
        a.FailureRate,
        a.AvgDeclineOnBadDays,
        w.WorstDay,
        ROUND(a.MinDeclineRate, 2) AS MinDeclineRate
    FROM AggregatedStats a
    LEFT JOIN WorstDayPerStock w ON a.StockID = w.StockID
    ORDER BY a.FailureRate DESC
    LIMIT 10;
  `;

  try {
    const result = await connection.query(query);
    const stocks = result.rows.map(row => ({
      field: row.stock_field,
      symbol: row.symbol,
      bad_days: row.baddays,
      total_days: row.totaldays,
      failure_rate: row.failurerate,
      avg_decline_on_bad_days: row.avgdeclineonbaddays,
      worst_day: row.worstday ? row.worstday.toISOString().split('T')[0] : null,
      min_decline_rate: row.mindeclinerate
    }));
    res.json(stocks);
  } catch (err) {
    console.error("Error fetching worst day trader stocks:", err);
    res.status(500).json({ message: "Internal Server Error", error: err.message });
  }
};

// Route11: GET /stocks/:field/yearly-stats
const stock_yearly_stats = async function (req, res) {
  const field = req.params.field;
  if (!field) {
    return res.status(400).json({ message: "Field parameter is required" });
  }

  const query = `
    WITH field_stocks AS (
      SELECT s.StockID
      FROM Stocks s
      WHERE LOWER(TRIM(s.Field)) = LOWER(TRIM($1))
    ),
    -- aggregate stock data by year
    stock_yearly AS (
      SELECT
        EXTRACT(YEAR FROM sp.Date)::int AS year,
        AVG(sp.Close) AS avg_close,
        AVG(sp.Volume) AS avg_volume
      FROM StockParameters sp
      JOIN field_stocks fs ON sp.StockID = fs.StockID
      WHERE EXTRACT(YEAR FROM sp.Date)::int BETWEEN 2020 AND 2025
      GROUP BY EXTRACT(YEAR FROM sp.Date)::int
    ),
    -- aggregate publication counts by year for that same field
    pub_yearly AS (
      SELECT
        p.year::int AS year,
        COUNT(*)::int AS num_publications
      FROM Publications p
      JOIN PublicationFields pf
        ON p.PublicationID = pf.PublicationID
      WHERE LOWER(TRIM(pf.FieldName)) = LOWER(TRIM($1))
        AND p.year BETWEEN 2020 AND 2025
      GROUP BY p.year::int
    )
    -- join the two series together
    SELECT
      sy.year            AS "Year",
      sy.avg_close       AS "AvgClosePrice",
      sy.avg_volume      AS "AvgVolume",
      COALESCE(py.num_publications, 0) AS "PublicationCount"
    FROM stock_yearly sy
    LEFT JOIN pub_yearly py
      ON sy.year = py.year
    ORDER BY sy.year;
  `;

  try {
    const result = await connection.query(query, [field.trim()]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: `No data found for '${field}' stocks between 2020 and 2025`
      });
    }

    const yearlyStats = result.rows.map(row => ({
      year:              row.Year,
      avg_close_price:   parseFloat(row.AvgClosePrice).toFixed(2),
      avg_volume:        Math.round(row.AvgVolume),
      publication_count: parseInt(row.PublicationCount, 10)
    }));

    return res.json(yearlyStats);
  } catch (err) {
    console.error(`Error fetching ${field} stock yearly stats:`, err);
    return res.status(500).json({
      message: "Internal Server Error",
      error: err.message
    });
  }
};

// Route: GET /stocks/publications/correlation
// Calculates, per field, the correlation between annual publication counts (with 2025 scaled ×4)
// and average stock closing prices (year extracted from sp.Date)
const stock_publication_correlation = async function (req, res) {
  const query = `
    WITH pub_yearly AS (
      SELECT
        pf.fieldname AS field,
        p.year,
        CASE
          WHEN p.year = 2025 THEN COUNT(*)::float * 4
          ELSE COUNT(*)::float
        END AS num_publications
      FROM publications p
      JOIN publicationfields pf
        ON p.publicationid = pf.publicationid
      GROUP BY pf.fieldname, p.year
    ),
    stock_yearly AS (
      SELECT
        s.field,
        EXTRACT(YEAR FROM sp.Date)::int AS year,
        AVG(sp.close)::float AS avg_close
      FROM stocks s
      JOIN stockparameters sp
        ON s.stockid = sp.stockid
      GROUP BY s.field, year
    ),
    merged AS (
      SELECT
        py.field,
        py.year,
        py.num_publications,
        sy.avg_close
      FROM pub_yearly py
      JOIN stock_yearly sy
        ON py.field = sy.field
       AND py.year  = sy.year
    )
    SELECT
      field,
      corr(num_publications, avg_close) AS publications_close_corr
    FROM merged
    GROUP BY field
    ORDER BY field;
  `;

  try {
    const result = await connection.query(query);
    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "No data available to calculate correlation"
      });
    }
    const correlationsData = result.rows.map(row => ({
      field: row.field,
      correlation: parseFloat(row.publications_close_corr || 0).toFixed(4)
    }));
    res.json(correlationsData);
  } catch (err) {
    console.error("Error calculating stock-publication correlation:", err);
    res.status(500).json({
      message: "Internal Server Error",
      error: err.message
    });
  }
};

// Route15: GET /publications/stocks/peak-difference
// This endpoint returns the peak publication year vs. peak stock year difference by field
const publication_stock_peak_diff = async (req, res) => {
  const query = `
    WITH pub_counts AS (
      SELECT
        pf.fieldname AS field,
        p.year,
        COUNT(*) AS pub_count
      FROM publications p
      JOIN publicationfields pf
        ON p.publicationid = pf.publicationid
      GROUP BY pf.fieldname, p.year
    ),
    pub_peaks AS (
      SELECT field, year AS peak_pub_year
      FROM (
        SELECT
          field,
          year,
          RANK() OVER (PARTITION BY field ORDER BY pub_count DESC) AS rnk
        FROM pub_counts
      ) sub
      WHERE rnk = 1
    ),
    stock_stats AS (
      SELECT
        s.field,
        EXTRACT(YEAR FROM sp.Date)::int AS year,
        AVG(sp.close) AS avg_close
      FROM stocks s
      JOIN stockparameters sp
        ON s.stockid = sp.stockid
      GROUP BY s.field, EXTRACT(YEAR FROM sp.Date)::int
    ),
    stock_peaks AS (
      SELECT field, year AS peak_stock_year
      FROM (
        SELECT
          field,
          year,
          RANK() OVER (PARTITION BY field ORDER BY avg_close DESC) AS rnk
        FROM stock_stats
      ) sub
      WHERE rnk = 1
    )
    SELECT
      pp.field,
      pp.peak_pub_year,
      spk.peak_stock_year,
      ABS(pp.peak_pub_year - spk.peak_stock_year) AS year_difference
    FROM pub_peaks pp
    JOIN stock_peaks spk
      ON pp.field = spk.field
    ORDER BY year_difference DESC;
  `;

  try {
    const result = await connection.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching publication-stock peak differences:", err);
    res.status(500).json({
      message: "Internal Server Error",
      error: err.message
    });
  }
};


// Route16: GET /stocks/:stock_id
const stock_details = (req, res) => {
  const stockId = req.params.stock_id;

  const query = `
    SELECT
      s.StockID,
      s.Symbol,
      s.Region,
      s.Field,
      sp.Date,
      EXTRACT(YEAR FROM sp.Date)::int AS year,
      sp.MarketCap,
      sp.Volume,
      sp.Open,
      sp.Close,
      sp.High,
      sp.Low
    FROM Stocks s
    JOIN StockParameters sp
      ON s.StockID = sp.StockID
    WHERE s.StockID = $1
    ORDER BY sp.Date DESC
    LIMIT 1;
  `;

  connection.query(query, [stockId], (err, result) => {
    if (err) {
      console.error("Error fetching stock details:", err);
      return res.status(500).json({ message: "Internal Server Error" });
    }
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Stock not found" });
    }

    const row = result.rows[0];
    // Format the date as YYYY-MM-DD
    const formattedDate = new Date(row.date).toISOString().split("T")[0];

    res.json({
      stock_id:    row.stockid,
      symbol:      row.symbol,
      region:      row.region,
      field:       row.field,
      date:        formattedDate,
      year:        row.year,
      market_cap:  row.marketcap,
      volume:      row.volume,
      open:        row.open,
      close:       row.close,
      high:        row.high,
      low:         row.low
    });
  });
};


// Route17: GET /stocks/:stock_id/timeseries
const stock_timeseries = (req, res) => {
  const stockId = req.params.stock_id;
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  // Validate required parameters
  if (!startDate || !endDate) {
      return res.status(400).json({ message: "start_date and end_date are required in YYYY-MM-DD format." });
  }

  const query = `
      SELECT StockID, Date, Open, Close, High, Low, Volume, MarketCap
      FROM StockParameters
      WHERE StockID = $1
      AND Date BETWEEN $2 AND $3
      ORDER BY Date ASC;
  `;

  connection.query(query, [stockId, startDate, endDate], (err, data) => {
      if (err) {
          console.error("Error fetching timeseries data:", err);
          res.status(500).json({ message: "Internal Server Error" });
      } else if (data.rows.length === 0) {
          res.status(404).json({ message: "No data found for the given range" });
      } else {
          const formatted = data.rows.map(row => ({
          stock_id: row.stockid,
          date: new Date(row.date).toISOString().split('T')[0], // Format to YYYY-MM-DD
          open: row.open,
          close: row.close,
          high: row.high,
          low: row.low,
          volume: row.volume,
          marketcap: row.marketcap
        }));
        res.json(formatted);
      }
  });
};

// Route18: GET /stocks/search
// Search stocks with flexible filtering options
// In routes.js
const search_stocks = async (req, res) => {
  const {
    symbol,
    region,
    field,
    date,        // Add support for single date parameter
    start_date,
    end_date,
    min_price,
    max_price
  } = req.query;

  try {
    // Base query
    let query = `
      SELECT 
        s.StockID AS stock_id,
        s.Symbol,
        s.Region,
        s.Field,
        sp.Date,
        sp.Open,
        sp.Close,
        sp.High,
        sp.Low,
        sp.Volume,
        sp.MarketCap AS market_cap
      FROM Stocks s
      JOIN StockParameters sp ON s.StockID = sp.StockID
      WHERE 1=1
    `;

    const params = [];

    // Add filters
    if (symbol) {
      query += ` AND s.Symbol ILIKE $${params.length + 1}`;
      params.push(`%${symbol}%`);
    }
    if (region) {
      query += ` AND s.Region = $${params.length + 1}`;
      params.push(region);
    }
    if (field) {
      query += ` AND s.Field = $${params.length + 1}`;
      params.push(field);
    }
    
    // Handle date filters - prioritize single date if provided
    if (date) {
      query += ` AND sp.Date::date = $${params.length + 1}::date`;
      params.push(date);
    } else {
      // If no single date, check for date range
      if (start_date) {
        query += ` AND CAST(sp.Date AS DATE) >= CAST($${params.length + 1} AS DATE)`;
        params.push(start_date);
      }
      if (end_date) {
        query += ` AND CAST(sp.Date AS DATE) <= CAST($${params.length + 1} AS DATE)`;
        params.push(end_date);
      }
      
      // If no date parameters provided at all, get latest data
      if (!start_date && !end_date) {
        query += `
          AND sp.Date = (
            SELECT MAX(Date) 
            FROM StockParameters 
            WHERE StockID = s.StockID
          )
        `;
      }
    }

    if (min_price) {
      query += ` AND sp.Close >= $${params.length + 1}`;
      params.push(parseFloat(min_price));
    }
    if (max_price) {
      query += ` AND sp.Close <= $${params.length + 1}`;
      params.push(parseFloat(max_price));
    }

    query += ` ORDER BY s.StockID, sp.Date DESC`;

    console.log('Executing query:', query); // Log the query
    console.log('With parameters:', params); // Log the parameters

    const result = await connection.query(query, params);
    
    const stocks = result.rows.map(row => ({
      ...row,
      // Remove the .toISOString() conversion since you already have pure dates
      date: row.date 
    }));

    res.json(stocks);

  } catch (err) {
    console.error("Detailed error:", {
      message: err.message,
      stack: err.stack,
      query: err.query,
      parameters: err.parameters
    });
    res.status(500).json({ 
      message: "Internal Server Error",
      error: err.message,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};




// Add to exports
module.exports = {
  random_book,
  top_stocks,
  latest_papers,
  top_rated_books,
  publication_details,
  publication_search,
  author_publications,
  author_network,
  author_timeline,
  stock_publications,
  stock_field_performance,  
  stock_fields,
  stock_publication_correlation,
  top_productive_authors,
  stock_yearly_stats,
  top_daytrader_stocks,
  worst_daytrader_stocks,
  top_author_collaborations,
  year_over_year_changes,
  publication_stock_peak_diff,
  stock_details,
  stock_timeseries,
  search_stocks,
  author_fields,
};


