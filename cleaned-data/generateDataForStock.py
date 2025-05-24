import pandas as pd


# 1. Read the cleaned CSV file
df = pd.read_csv('stock_cleaned.csv')

# Convert Date from DD/MM/YYYY to YYYY-MM-DD
# Set dayfirst=True so pandas knows the first part is the day, not the month.
df['Date'] = pd.to_datetime(df['Date'], dayfirst=True).dt.strftime('%Y-%m-%d')

# 2. Create the Stocks table
#    Extract unique combinations of Symbol, Region, Field
stocks = df[['Symbol', 'Region', 'Field']].drop_duplicates().reset_index(drop=True)
#    Create a new StockID column (starting from 1)
stocks['StockID'] = range(1, len(stocks) + 1)

#    Reorder columns to match the target table schema
stocks = stocks[['StockID', 'Symbol', 'Region', 'Field']]

# 3. Create the StockParameters table
#    Merge the original DataFrame with stocks to assign StockID to each record
stock_params = df.merge(stocks, on=['Symbol', 'Region', 'Field'], how='left')

#    Select and reorder the columns for the StockParameters table
stock_params = stock_params[['StockID', 'Date', 'Year', 'MarketCap', 'Volume', 'Open', 'Close', 'High', 'Low']]

# Optionally, round the price columns to two decimal places for DECIMAL(10,2) format
stock_params['Open'] = stock_params['Open'].round(2)
stock_params['Close'] = stock_params['Close'].round(2)
stock_params['High'] = stock_params['High'].round(2)
stock_params['Low'] = stock_params['Low'].round(2)

# 4. Export the tables to CSV files
stocks.to_csv('Stocks.csv', index=False)
stock_params.to_csv('StockParameters.csv', index=False)

print("Stocks and StockParameters CSV files have been generated.")
