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

var handle = '[LISTENER] '
var chess = new Chess()
var challengeFlag = 0
var takebackFlag = 0
var drawFlag = 0
var gameFlag = false

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
              challengeFlag = 2
              return '[SYSTEM] Incoming Challenge, Accept? (y/N): '

            case 'offer takeback':
              if (gameFlag) {
                takebackFlag = 2
                return '[SYSTEM] Opponent Offers Takeback, Accept? (y/N): '
              }

              return handle + data + '\n'

            case 'offer draw':
              if (gameFlag) {
                drawFlag = 2
                return '[SYSTEM] Opponent Offers Draw, Accept? (y/N): '
              }

              return handle + data + '\n'

            case 'resign':
              if (gameFlag) {
                gameFlag = false
                return '[SYSTEM] Opponent Resigned!\n'
              }

              return handle + data + '\n'

            case 'y':
              if (challengeFlag === 1) {
                challengeFlag = 0
                gameFlag = true
                chess.reset()
                return '[SYSTEM] Challenge Accepted!\n'
              }

              if (takebackFlag === 1) {
                takebackFlag = 0
                chess.undo()
                return '[SYSTEM] Takeback Accepted!\n'
              }

              if (drawFlag === 1) {
                drawFlag = 0
                gameFlag = false
                chess.reset()
                return '[SYSTEM] Draw Accepted!\n'
              }

              return handle + data + '\n'

            default:
              if (challengeFlag > 0) {
                if (challengeFlag > 1) {
                  challengeFlag = 0
                  if (data === 'cancel') {
                    return '\n[SYSTEM] Challenge Cancelled!\n'
                  }
                  return '\n[SYSTEM] Challenge Cancelled!\n' + handle + data + '\n'
                }

                challengeFlag = 0
                if (data === 'N') {
                  return '[SYSTEM] Challenge Declined!\n'
                }
                return '[SYSTEM] Challenge Declined!\n' + handle + data + '\n'
              }

              if (takebackFlag > 0) {
                if (takebackFlag > 1) {
                  takebackFlag = 0
                  if (data === 'cancel') {
                    return '\n[SYSTEM] Takeback Cancelled!\n'
                  }
                  return '\n[SYSTEM] Takeback Cancelled!\n' + handle + data + '\n'
                }

                takebackFlag = 0
                if (data === 'N') {
                  return '[SYSTEM] Takeback Declined!\n'
                }
                return '[SYSTEM] Takeback Declined!\n' + handle + data + '\n'
              }

              if (drawFlag > 0) {
                if (drawFlag > 1) {
                  drawFlag = 0
                  if (data === 'cancel') {
                    return '\n[SYSTEM] Draw Offer Cancelled!\n'
                  }
                  return '\n[SYSTEM] Draw Offer Cancelled!\n' + handle + data + '\n'
                }

                drawFlag = 0
                if (data === 'N') {
                  return '[SYSTEM] Draw Offer Declined!\n'
                }
                return '[SYSTEM] Draw Offer Declined!\n' + handle + data + '\n'
              }

              if (gameFlag) {
                if (chess.move(data) != null) {
                  return '[SYSTEM] Opponent plays ' + data + '\n'
                }
              }

              return handle + data + '\n'
          }
        }),
        pull.drain(x => process.stdout.write(x))
      )

      process.stdin.setEncoding('utf8')
      process.openStdin().on('data', (chunk) => {
        var data = chunk.toString().replace('\n', '')

        switch (data) {
          case 'start game':
            challengeFlag = 1
            p.push(data)
            break

          case 'offer takeback':
            if (gameFlag) {
              takebackFlag = 1
              console.log('[SYSTEM] You Offered a Takeback!')
            }
            p.push(data)
            break

          case 'offer draw':
            if (gameFlag) {
              drawFlag = 1
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
            if (challengeFlag > 1) {
              challengeFlag = 0
              gameFlag = true
              chess.reset()
            }

            if (drawFlag > 1) {
              drawFlag = 0
              gameFlag = false
            }

            if (takebackFlag > 1) {
              takebackFlag = 0
              chess.undo()
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
            challengeFlag = 0
            takebackFlag = 0
            drawFlag = 0

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
