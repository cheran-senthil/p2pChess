'use strict'
/* eslint-disable no-console */

const PeerId = require('peer-id')
const PeerInfo = require('peer-info')
const Node = require('./libp2p-bundle.js')
const pull = require('pull-stream')
const Pushable = require('pull-pushable')
const Chess = require('chess.js').Chess
const p = Pushable()

var dialer = '[DIALER] '
var gameFlagListener = false
var gameFlagDialer = false
var drawFlagDialer = false
var drawFlagListener = false
var gameFlag = false
var chess = new Chess()

PeerId.createFromJSON(require('./peer-id-listener'), (err, idListener) => {
  if (err) {
    throw err
  }
  const peerListener = new PeerInfo(idListener)
  peerListener.multiaddrs.add('/ip4/0.0.0.0/tcp/10333')
  const nodeListener = new Node({
    peerInfo: peerListener
  })

  nodeListener.start((err) => {
    if (err) {
      throw err
    }

    nodeListener.on('peer:connect', (peerInfo) => {
      console.log(peerInfo.id.toB58String())
    })

    nodeListener.handle('/chat/1.0.0', (protocol, conn) => {
      pull(
        p,
        conn
      )

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

              return dialer + data + '\n'

            case 'resign':
              if (gameFlag) {
                gameFlag = false
                return '[SYSTEM] Opponent Resigned!\n'
              }

              return dialer + data + '\n'

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

              return dialer + data + '\n'

            default:
              if (gameFlagListener) {
                gameFlagListener = false
                if (data === 'N') {
                  return '[SYSTEM] Challenge Declined!\n'
                }
                return '[SYSTEM] Challenge Declined!\n' + dialer + data + '\n'
              }

              if (gameFlagDialer) {
                gameFlagDialer = false
                if (data === 'cancel') {
                  return '\n[SYSTEM] Challenge Cancelled!\n'
                }
                return '\n[SYSTEM] Challenge Cancelled!\n' + dialer + data + '\n'
              }

              if (drawFlagListener) {
                drawFlagListener = false
                if (data === 'N') {
                  return '[SYSTEM] Draw Offer Declined!\n'
                }
                return '[SYSTEM] Draw Offer Declined!\n' + dialer + data + '\n'
              }

              if (drawFlagDialer) {
                drawFlagDialer = false
                if (data === 'cancel') {
                  return '\n[SYSTEM] Draw Offer Cancelled!\n'
                }
                return '\n[SYSTEM] Draw Offer Cancelled!\n' + dialer + data + '\n'
              }

              if (gameFlag) {
                if (chess.move(data) != null) {
                  return '[SYSTEM] Opponent plays ' + data + '\n'
                }
              }

              return dialer + data + '\n'
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

    console.log('Listener ready, listening on:')
    peerListener.multiaddrs.forEach((ma) => {
      console.log(ma.toString() + '/ipfs/' + idListener.toB58String())
    })
  })
})
