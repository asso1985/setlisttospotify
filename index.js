const express = require('express');
const setlistfm = require('setlistfm-js');
const SpotifyWebApi = require('spotify-web-api-node');
const passport = require('passport');
const SpotifyStrategy = require('passport-spotify').Strategy;
const app = express();

app.use(require('express-session')({
  secret: 'keyboard cat',
  resave: true,
  saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());

const setlistfmClient = new setlistfm({
  key: "8dba8e27-1c18-41aa-890c-81cb0111fe1e",
  format: "json",
  language: "en"
});

const spotifyApi = new SpotifyWebApi({
  clientId : '308232bf7c424d9e9761c63df9cba02c',
  clientSecret : '8aa3de7ee0d344d795206275626a92a5',
  redirectUri : 'http://www.example.com/callback'
});

const genericError = () => ({
  message: 'Sorry'
});

passport.use(new SpotifyStrategy({
    clientID: '308232bf7c424d9e9761c63df9cba02c',
    clientSecret: '8aa3de7ee0d344d795206275626a92a5',
    callbackURL: "http://localhost:3000/auth/spotify/callback"
  },
  function(accessToken, refreshToken, profile, done) {
    spotifyApi.setAccessToken(accessToken);
    done();
  }
));


app.get('/auth/spotify',
  passport.authenticate('spotify', {scope: ['playlist-modify-private', 'user-read-private'], showDialog: true}),
  function(req, res){});

app.get('/auth/spotify/callback',
  passport.authenticate('spotify', {scope: ['playlist-modify-private', 'user-read-private'], showDialog: true}),
  function(req, res) {
    res.redirect('/');
  });


app.get('/setlist/artist/:artistName', function (req, res) {
  setlistfmClient.searchArtists({
    artistName: req.params.artistName
  })
  .then(function(results) {
    res.send(results);
  })
  .catch(function(error) {
    res.send(genericError);
  });
});


app.get('/setlist/search/:artistId', function (req, res) {
  setlistfmClient.getArtistSetlists(req.params.artistId, {
    p: 1
  })
  .then(function(results) {
    res.send(results);
  })
  .catch(function(error) {
    res.send(genericError);
  });
});


app.get('/spotify/search/track/:trackName/:artistName', function (req, res) {
  spotifyApi.searchTracks('track:'+req.params.trackName+' artist:'+req.params.artistName+'')
    .then(function(results) {
      console.log(results.body.tracks);
      res.send(results.body.tracks.items[0]);
    }, function(err) {
      console.log(err);
      res.send(genericError);
    });
});

app.get('/spotify/save-playlist', function (req, res) {
	// Create a private playlist
	const playlistName = req.query.playlistName;
	const userName = '1167004262';
	const tracks = req.body.tracks;

	const addToplaylist = (playlistId) => {
		spotifyApi.addTracksToPlaylist(
			userName,
			playlistId,
			[tracks])
		  .then(function(data) {
		    res.send({success:'OK', data : {"playlistName" : playlistName}})
		  }, function(err) {
		  	res.send({success:'KO'})
		  });
	}

	spotifyApi.createPlaylist(userName, playlistName, { 'public' : false })
	  .then(function(data) {
	    console.log('Created playlist!');
	    addToplaylist(data.body.id)
	  }, function(err) {
	    console.log('Something went wrong creating playlist!', err);
	  });
});

app.listen(3000, function () {
  console.log('Example app listening on port 3000!')
})