'use strict'
const config = require('config')
const SetlistFM = require('setlistfm-js')
const SpotifyWebApi = require('spotify-web-api-node')

// external apis and services
const setlistfmClient = new SetlistFM(config.get('setlistfm'))
const spotifyApi = new SpotifyWebApi(config.get('spotify.clientConfig'))
const spotifyAuthURL = spotifyApi.createAuthorizeURL(config.get('spotify.authConfig.scope'), config.get('spotify.authConfig.state'))

// fastify web server
const fastify = require('fastify')({
  logger: {
    level: config.get('logLevel')
  }
})

fastify.use(require('cors')())

// routes
fastify.get('/setlist/artist/:artistName', (req, reply) => {
  return setlistfmClient.searchArtists({
    artistName: req.params.artistName
  })
  .then(results => {
    return results.artist.sort((a, b) => {
      if (a.tmid && b.tmid) {
        return a.tmid > b.tmid
      } else if (a.tmid && !b.tmid) {
        return false
      } else if (!a.tmid && b.tmid) {
        return true
      } else {
        return a.mbid > b.mbid
      }
    })
  })
})

fastify.get('/setlist/search/:artistId/:page', (req, reply) => {
  return setlistfmClient.getArtistSetlists(req.params.artistId, {
    p: req.params.page || 1
  })
})

fastify.get('/auth/spotify', (req, reply) => {
  reply.redirect(spotifyAuthURL)
})

fastify.get('/auth/spotify/callback', (req, reply) => {
  Promise.all([spotifyApi.authorizationCodeGrant(req.query.code), spotifyApi.getMe()])
    .then(values => {
      const authRes = values[0]
      const userRes = values[1]

      const ttl = Math.floor(Date.now() / 1000) + authRes.body['expires_in']
      const redirectUrl = [config.get('frontendUrl'), '/#/auth/spotify?token=', authRes.body['access_token'], '&expiry=', ttl, '&userId=', userRes.body.id].join('')

      spotifyApi.setAccessToken(authRes.body['access_token'])
      spotifyApi.setRefreshToken(authRes.body['refresh_token'])

      reply.redirect(redirectUrl)
    })
})

fastify.get('/spotify/artist/:artistId', (req, reply) => {
  const authorization = req.headers.authorization
  return new Promise((resolve, reject) => {
    if (!authorization) {
      return spotifyApi.clientCredentialsGrant()
        .then(data => {
          spotifyApi.setAccessToken(data.body['access_token'])
        })
    }
    spotifyApi.setAccessToken(authorization)
    spotifyApi.setRefreshToken(authorization)
    return
  }).then(() => {
    return spotifyApi.getArtist(req.params.artistId)
  })
  .then(result => {
    return result.body
  })
})

fastify.get('/spotify/search/track/:artistName/:trackName', (req, reply) => {
  const authorization = req.headers.authorization
  return new Promise((resolve, reject) => {
    if (!authorization) {
      return spotifyApi.clientCredentialsGrant()
        .then(data => {
          spotifyApi.setAccessToken(data.body['access_token'])
        })
    }
    spotifyApi.setAccessToken(authorization)
    spotifyApi.setRefreshToken(authorization)
    return
  })
  .then(() => {
    return spotifyApi.searchTracks(['track:', req.params.trackName, ' artist:', req.params.artistName].join(''))
  })
  .then(result => {
    return result.body.tracks.items[0]
  })
})

fastify.post('/spotify/save-playlist', (req, reply) => {
  const {userId, playlistName, tracks} = req.body
  const authorization = req.headers.authorization
  return new Promise((resolve, reject) => {
    if (!authorization) {
      return spotifyApi.clientCredentialsGrant()
        .then(data => {
          spotifyApi.setAccessToken(data.body['access_token'])
        })
    }
    spotifyApi.setAccessToken(authorization)
    spotifyApi.setRefreshToken(authorization)
    return
  })
  .then(() => {
    return spotifyApi.createPlaylist(userId, playlistName, { 'public': false })
  })
  .then(data => {
    return addToplaylist(userId, data.body.id, tracks)
  })
})

fastify.listen(process.env.PORT || config.get('listeningPort'), function (err) {
  if (err) throw err
  console.log(`server listening on ${fastify.server.address().port}`)
})

const addToplaylist = (userId, playlistId, tracks) => {
  return spotifyApi.addTracksToPlaylist(userId, playlistId, tracks)
  .then(() => {
    return spotifyApi.getPlaylist(userId, playlistId)
  })
}
