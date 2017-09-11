const express = require('express');
const cors = require('cors');
const setlistfm = require('setlistfm-js');
const SpotifyWebApi = require('spotify-web-api-node');
const passport = require('passport');
const SpotifyStrategy = require('passport-spotify').Strategy;
const _ = require('lodash');
const app = express();
const bodyParser = require('body-parser');
app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies
const BASE_URL = 'https://api-setlist-to-spotify.herokuapp.com';
// const BASE_URL = 'http://localhost:3000';

const BASE_FRONT_URL = 'https://frontend-setlist-to-spotify.herokuapp.com';
// const BASE_FRONT_URL = 'http://localhost:8080';

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
  redirectUri : BASE_URL + 'auth/spotify'
});

const genericError = () => {
  return {
    error : true,
    message: 'Sorry'
  }
};

let expires_in = '';

spotifyApi.clientCredentialsGrant()
  .then(function(data) {
    expires_in = data.body['expires_in'];
    // Save the access token so that it's used in future calls
    spotifyApi.setAccessToken(data.body['access_token']);

  }, function(err) {
    console.log('Something went wrong when retrieving an access token', err.message);
  });

passport.use(new SpotifyStrategy({
    clientID: '308232bf7c424d9e9761c63df9cba02c',
    clientSecret: '8aa3de7ee0d344d795206275626a92a5',
    callbackURL: BASE_URL + "/auth/spotify/callback"
  },
  function(accessToken, refreshToken, profile, done) {
    spotifyApi.setAccessToken(accessToken);
    spotifyApi.setRefreshToken(refreshToken);
    process.nextTick(function () {
      const data = {
        profile : profile,
        accessToken: accessToken,
        refreshToken: refreshToken
      }
      return done(null, data);
    });
  }
));

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});

app.use(cors());

app.get('/auth/spotify',
  passport.authenticate('spotify', {scope: ['playlist-modify-private', 'user-read-private'], showDialog: true}),
  function(req, res){});

app.get('/auth/spotify/callback',
  passport.authenticate('spotify', {scope: ['playlist-modify-private', 'user-read-private'], showDialog: true}),
  function(req, res){
    res.redirect(BASE_FRONT_URL + '/#/auth/spotify?token='+req.user.accessToken);
  });


app.get('/setlist/artist/:artistName', function (req, res) {
  setlistfmClient.searchArtists({
    artistName: req.params.artistName
  })
  .then(function(results) {
    const list = _.filter(results.artist, function(a) { return a.tmid; });
    results.artist = list;
    res.send(results);
  })
  .catch(function(error) {
    if (error) {
      res.send(JSON.stringify(genericError()));
    }
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

app.get('/spotify/artist/:artistId', function (req, res) {
  spotifyApi.getArtist(req.params.artistId)
  .then(function(resultsArtist) {
    res.send(resultsArtist.body);
  })
});

app.get('/spotify/search/track/:artistName/:trackName', function (req, res) {
  spotifyApi.searchTracks('track:'+req.params.trackName+' artist:'+req.params.artistName+'')
    .then(function(resultsTrack) {
      if (resultsTrack.body.tracks.items.length > 0) {
        res.send(resultsTrack.body.tracks.items[0]);
      } else {
        res.send(JSON.stringify(genericError()));
      }
      
    }, function(err) {
      res.send(JSON.stringify(genericError()));
    });
});

app.post('/spotify/save-playlist', function (req, res) {
  const userName = req.body.userName;
  const playlistName = req.body.playlistName;
  const tracks = req.body.tracks;

  const addToplaylist = (playlistId) => {
    spotifyApi.addTracksToPlaylist(
      userName,
      playlistId,
      tracks)
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

app.listen(process.env.PORT || 3000, function(){
  console.log('Example app listening on port 3000!')
})