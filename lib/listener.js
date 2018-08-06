'use strict'
/* eslint-disable no-console */

const PeerId = require('peer-id')
const PeerInfo = require('peer-info')
const Node = require('./libp2p-bundle.js')
const pull = require('pull-stream')
const Pushable = require('pull-pushable')
const Chess = require('chess.js').Chess
const p = Pushable()

var startGameFlag = false
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
              startGameFlag = true
              return 'Incoming Challenge, Accept? (y/N): '
            case 'y':
              if (startGameFlag) {
                gameFlag = true
                return 'Challenge Accepted!' + '\n'
              }
              return 'y\n'
            default:
              startGameFlag = false
              if (gameFlag) {
                if (chess.move(data) != null) {
                  return 'Opponent plays ' + data + '\n'
                }
              }
              return data + '\n'
          }
        }),
        pull.drain(x => process.stdout.write(x))
      )

      process.stdin.setEncoding('utf8')
      process.openStdin().on('data', (chunk) => {
        var data = chunk.toString().replace('\n', '')
        switch (data) {
          case 'start game':
            startGameFlag = true
            p.push(data)
            break
          case 'y':
            startGameFlag = false
            gameFlag = true
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
            startGameFlag = false
            if (gameFlag) {
              console.log('You played ' + data)
              chess.move(data)
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
