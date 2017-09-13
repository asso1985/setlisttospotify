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

let TOKEN = null;

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
  redirectUri : BASE_URL + '/auth/spotify/callback'
});

const genericError = () => {
  return {
    error : true,
    message: 'Sorry'
  }
};

let expires_in = '';

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

/*passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});*/

app.use(cors());


app.all('*', function(req, res, next) {
     var origin = req.get('origin'); 
     res.header('Access-Control-Allow-Origin', origin);
     res.header("Access-Control-Allow-Headers", "X-Requested-With");
     res.header('Access-Control-Allow-Headers', 'Content-Type');
     next();
});

/*app.get('/auth/spotify',
  passport.authenticate('spotify', {scope: ['playlist-modify-private', 'user-read-private'], showDialog: true}),
  function(req, res){});*/

app.get('/auth/spotify', function(req, res){
  const scopes = ['playlist-modify-private', 'user-read-private'];
  const state = 'IT';
  const authorizeURL = spotifyApi.createAuthorizeURL(scopes, state);
  res.redirect(authorizeURL);
})

/*app.get('/auth/spotify/callback',
  passport.authenticate('spotify', {scope: ['playlist-modify-private', 'user-read-private'], showDialog: true}),
  function(req, res){
    console.log(req.user);
    spotifyApi.setAccessToken(req.user.accessToken);
    spotifyApi.setRefreshToken(req.user.refreshToken);
    res.redirect(BASE_FRONT_URL + '/#/auth/spotify?token='+req.user.accessToken);
  });
*/

app.get('/auth/spotify/callback', function(req, res){
    console.log('code', req.query.code);
    const code = req.query.code;
    spotifyApi.authorizationCodeGrant(code)
    .then(function(data){
      console.log('The token expires in ' + data.body['expires_in']);
      console.log('The access token is ' + data.body['access_token']);
      console.log('The refresh token is ' + data.body['refresh_token']);

      TOKEN = data.body['access_token'];

      // Set the access token on the API object to use it in later calls
      spotifyApi.setAccessToken(data.body['access_token']);
      spotifyApi.setRefreshToken(data.body['refresh_token']);
      res.redirect(BASE_FRONT_URL + '/#/auth/spotify?token=' + data.body['access_token']);
    })
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
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    spotifyApi.clientCredentialsGrant()
    .then(function(data) {
      spotifyApi.setAccessToken(data.body['access_token']);
      spotifyApi.getArtist(req.params.artistId)
      .then(function(resultsArtist) {
        res.send(resultsArtist.body);
      })
    }, function(err) {
      console.log('Something went wrong when retrieving an access token', err.message);
    });
  } else {
    spotifyApi.setAccessToken(authHeader);
    spotifyApi.setRefreshToken(authHeader);
    spotifyApi.getArtist(req.params.artistId)
    .then(function(resultsArtist) {
      res.send(resultsArtist.body);
    })
  }
});

app.get('/spotify/search/track/:artistName/:trackName', function (req, res) {
  console.log(req.headers.authorization);
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    spotifyApi.clientCredentialsGrant()
      .then(function(data) {
        spotifyApi.setAccessToken(data.body['access_token']);
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
    })
  } else {
    spotifyApi.setAccessToken(authHeader);
    spotifyApi.setRefreshToken(authHeader);
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
  }
});

app.post('/spotify/save-playlist', function (req, res) {
  const userId = req.body.userId;
  const playlistName = req.body.playlistName;
  const tracks = req.body.tracks;
  const authHeader = req.headers.authorization;

  console.log('userId', userId);
  console.log('TOKEN', TOKEN);

  const addToplaylist = (playlistId) => {
    spotifyApi.addTracksToPlaylist(
      userId,
      playlistId,
      tracks)
      .then(function(data) {
        spotifyApi.getPlaylist(userId, playlistId)
        .then(function(data){
          console.log('Tracks added to '+playlistId+' playlist!');
          res.send({success:'OK', data : data.body});
        })
      }, function(err) {
        res.send({success:'KO'})
      });
  }

  if (authHeader) {
    spotifyApi.setAccessToken(authHeader);
    spotifyApi.setRefreshToken(authHeader);
    spotifyApi.createPlaylist(userId, playlistName, { 'public' : false })
      .then(function(data) {
        console.log('Created playlist!');
        addToplaylist(data.body.id)
      }, function(err) {
        console.log('Something went wrong creating playlist!', err);
      });
  } else {
    res.send({respondStatus: 403, success: 'KO', message: 'Not authorized'})
  }

});

app.listen(process.env.PORT || 3000, function(){
  console.log('Example app listening on port 3000!')
})