const express = require('express');
const cors = require('cors');
const config = require('./config');
const routes = require('./routes');

const app = express();
app.use(cors({
  origin: '*',
}));

// We use express to define our various API endpoints and
// provide their handlers that we implemented in routes.js

// home page related api endpoints
app.get('/randombook', routes.random_book);

app.get('/home/top-stocks', routes.top_stocks);
app.get('/home/latest-papers', routes.latest_papers);
app.get('/home/top-rated-books', routes.top_rated_books);

// author page related api endpoints
app.get('/authors/:author_id/publications', routes.author_publications);
app.get('/authors/:author_id/network', routes.author_network);
app.get('/authors/:author_id/timeline', routes.author_timeline);
app.get('/authors/:author_id/fields', routes.author_fields);
app.get('/authors/top-productive', routes.top_productive_authors);
app.get('/authors/top-collaborations', routes.top_author_collaborations);


// publication page related api endpoints
app.get('/publications/search', routes.publication_search);
app.get('/publications/:publication_id', routes.publication_details);
app.get('/stocks/:stock_symbol/publications', routes.stock_publications);

// Stock page related api endpoints

app.get('/stocks/search', routes.search_stocks); 
app.get('/stocks/top-daytrader', routes.top_daytrader_stocks);
app.get('/stocks/worst-daytrader', routes.worst_daytrader_stocks);
app.get('/stocks/fields', routes.stock_fields);
app.get('/stocks/:stock_id', routes.stock_details);
app.get('/stocks/:stock_id/timeseries', routes.stock_timeseries);

app.get('/stocks/:field/performance', routes.stock_field_performance);

app.get('/stocks/:field/yearly-stats', routes.stock_yearly_stats);



// stock/publication relation page related api endpoints
app.get('/stocks/publications/correlation', routes.stock_publication_correlation);
app.get('/publications/stocks/yoy-changes', routes.year_over_year_changes);
app.get('/publications/stocks/peak-difference', routes.publication_stock_peak_diff);

/**The following is copied from HW3 for reference */
// app.get('/author/:type', routes.author);
// app.get('/random', routes.random);
// app.get('/song/:song_id', routes.song);
// app.get('/album/:album_id', routes.album);
// app.get('/albums', routes.albums);
// app.get('/album_songs/:album_id', routes.album_songs);
// app.get('/top_songs', routes.top_songs);
// app.get('/top_albums', routes.top_albums);
// app.get('/search_songs', routes.search_songs);

app.listen(config.server_port, () => {
  console.log(`Server running at http://${config.server_host}:${config.server_port}/`)
});

module.exports = app;
