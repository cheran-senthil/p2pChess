'use strict'
/* eslint-disable no-console */

const PeerId = require('peer-id')
const PeerInfo = require('peer-info')
const Node = require('./libp2p-bundle')
const pull = require('pull-stream')
const async = require('async')
const Pushable = require('pull-pushable')
const Chess = require('chess.js').Chess
const p = Pushable()
let idListener

var listener = '[LISTENER] '
var gameFlagListener = false
var gameFlagDialer = false
var drawFlagListener = false
var drawFlagDialer = false
var gameFlag = false
var chess = new Chess()

async.parallel([
  (callback) => {
    PeerId.createFromJSON(require('./peer-id-dialer'), (err, idDialer) => {
      if (err) {
        throw err
      }
      callback(null, idDialer)
    })
  },
  (callback) => {
    PeerId.createFromJSON(require('./peer-id-listener'), (err, idListener) => {
      if (err) {
        throw err
      }
      callback(null, idListener)
    })
  }
], (err, ids) => {
  if (err) throw err
  const peerDialer = new PeerInfo(ids[0])
  peerDialer.multiaddrs.add('/ip4/0.0.0.0/tcp/0')
  const nodeDialer = new Node({
    peerInfo: peerDialer
  })

  const peerListener = new PeerInfo(ids[1])
  idListener = ids[1]
  peerListener.multiaddrs.add('/ip4/127.0.0.1/tcp/10333')
  nodeDialer.start((err) => {
    if (err) {
      throw err
    }

    console.log('Dialer ready, listening on:')

    peerListener.multiaddrs.forEach((ma) => {
      console.log(ma.toString() + '/ipfs/' + idListener.toB58String())
    })

    nodeDialer.dialProtocol(peerListener, '/chat/1.0.0', (err, conn) => {
      if (err) {
        throw err
      }
      console.log('nodeA dialed to nodeB on protocol: /chat/1.0.0')
      console.log('Type a message and see what happens')
      // Write operation. Data sent as a buffer
      pull(
        p,
        conn
      )
      // Sink, data converted from buffer to utf8 string
      pull(
        conn,
        pull.map((chunk) => {
          var data = chunk.toString('utf8').replace('\n', '')

          switch (data) {
            case 'start game':
              gameFlagDialer = true
              return '[SYSTEM] Incoming Challenge, Accept? (y/N): '

            case 'offer draw':
              if (gameFlag) {
                drawFlagDialer = true
                return '[SYSTEM] Opponent Offers Draw, Accept? (y/N): '
              }

              return listener + data + '\n'

            case 'resign':
              if (gameFlag) {
                gameFlag = false
                return '[SYSTEM] Opponent Resigned!\n'
              }

              return listener + data + '\n'

            case 'y':
              if (gameFlagListener) {
                gameFlagListener = false
                gameFlag = true
                chess.reset()
                return '[SYSTEM] Challenge Accepted!\n'
              }

              if (drawFlagListener) {
                drawFlagListener = false
                gameFlag = false
                chess.reset()
                return '[SYSTEM] Draw Accepted!\n'
              }

              return listener + data + '\n'

            default:
              if (gameFlagListener) {
                gameFlagListener = false
                if (data === 'N') {
                  return '[SYSTEM] Challenge Declined!\n'
                }
                return '[SYSTEM] Challenge Declined!\n' + listener + data + '\n'
              }

              if (gameFlagDialer) {
                gameFlagDialer = false
                if (data === 'cancel') {
                  return '\n[SYSTEM] Challenge Cancelled!\n'
                }
                return '\n[SYSTEM] Challenge Cancelled!\n' + listener + data + '\n'
              }

              if (drawFlagListener) {
                drawFlagListener = false
                if (data === 'N') {
                  return '[SYSTEM] Draw Offer Declined!\n'
                }
                return '[SYSTEM] Draw Offer Declined!\n' + listener + data + '\n'
              }

              if (drawFlagDialer) {
                drawFlagDialer = false
                if (data === 'cancel') {
                  return '\n[SYSTEM] Draw Offer Cancelled!\n'
                }
                return '\n[SYSTEM] Draw Offer Cancelled!\n' + listener + data + '\n'
              }

              if (gameFlag) {
                if (chess.move(data) != null) {
                  return '[SYSTEM] Opponent plays ' + data + '\n'
                }
              }

              return listener + data + '\n'
          }
        }),
        pull.drain(x => process.stdout.write(x))
      )

      process.stdin.setEncoding('utf8')
      process.openStdin().on('data', (chunk) => {
        var data = chunk.toString().replace('\n', '')

        switch (data) {
          case 'start game':
            gameFlagListener = true
            p.push(data)
            break

          case 'offer draw':
            if (gameFlag) {
              drawFlagListener = true
              console.log('[SYSTEM] You Offered a Draw!')
            }
            p.push(data)
            break

          case 'resign':
            if (gameFlag) {
              gameFlag = false
              console.log('[SYSTEM] You Resigned!')
            }
            p.push(data)
            break

          case 'y':
            if (gameFlagDialer) {
              gameFlagDialer = false
              gameFlag = true
              chess.reset()
            }

            if (drawFlagDialer) {
              drawFlagDialer = false
              gameFlag = false
            }

            p.push(data)
            break

          case 'show board':
            if (gameFlag) {
              console.log(chess.ascii())
            } else {
              p.push(data)
            }

            break

          default:
            gameFlagListener = false
            drawFlagListener = false

            if (gameFlag) {
              if (chess.move(data) != null) {
                console.log('[SYSTEM] You played ' + data)
              }
            }

            p.push(data)
            break
        }
      })
    })
  })
})
