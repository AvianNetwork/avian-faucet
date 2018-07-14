#!/usr/bin/env node

var http = require('http')
var path = require('path')
var Blockchain = require('cb-insight')
var chalk = require('chalk')
var express = require('express')
var fs = require('fs')
var bitcoin = require('bitcoinjs-lib')

var PORT = process.env.FAUCET_PORT || process.env.PORT || 14004

var privkey = process.env.PRIVKEY

if (privkey == undefined) {
  var WALLET_FILE = process.env.FAUCET_WALLET || path.join(process.env.HOME || process.env.USERPROFILE, '.ravencoin-faucet', 'wallet')
  var WALLET_PATH = process.env.FAUCET_PATH || path.join(process.env.HOME || process.env.USERPROFILE, '.ravencoin-faucet')
  // initialize wallet
  if (!fs.existsSync(WALLET_FILE)) {
    privkey = bitcoin.ECPair.makeRandom({network: bitcoin.networks.testnet, compressed: false}).toWIF()
    fs.mkdirSync(WALLET_PATH);
	fs.writeFileSync(WALLET_FILE, privkey, 'utf-8')
  } else {
    privkey = fs.readFileSync(WALLET_FILE, 'utf-8')
  }
}

var keypair = bitcoin.ECPair.fromWIF(privkey, bitcoin.networks.testnet)
var address = keypair.getAddress().toString()

var blockchain = new Blockchain('https://testnet.ravencoin.network')

var app = express()
app.get('/faucet', function (req, res) {
  var pkg = require('./package')
  res.set('Content-Type', 'text/plain')
  res.end('ravencoin-faucet version: ' + pkg.version + '\n\nPlease send funds back to: ' + address)
})

// only ravencoin testnet supported for now
app.get('/faucet/withdrawal', function (req, res) {
  if (!req.query.address) {
    return res.status(422).send({ status: 'error', data: { message: 'You forgot to enter an address.' } })
  }

  // satoshis
  var amount = 55000000000
  var addy = req.query.address.toString()
  console.log('Field Input:', addy);
  if(isAddress(addy)) {
  test(req.query.address, function (err, bal) {
	if(bal <= 550000000000) {
		spend(keypair, req.query.address, amount, function (err, txId) {
			if (err) {
				return res.status(500).send({status: 'error', data: {message: err.message}})
			}
			return res.send({status: 'success', data: {txId: txId}})
		})
	}
	if (bal > 550000000000){
		return res.status(422).send({ status: 'error', data: { message: 'Try again later after making some assets.' } })
	}

  })
  } else {
  return res.status(425).send({ status: 'error', data: { message: 'Please enter a valid Testnet Address' } })
  }
})
function isAddress(string) {
  try {
    bitcoin.address.toOutputScript(string, bitcoin.networks.testnet)
  } catch (e) {
    return false
  }

  return true
}
function test(addr, callback) { 
  blockchain.addresses.summary(addr, function (err, data) {
    if (err) return callback(err)

	callback(null, data.balance)
	})
}
function spend(keypair, toAddress, amount, callback) {
  blockchain.addresses.unspents(address, function (err, utxos) {
    if (err) return callback(err)

    var balance = utxos.reduce(function (amount, unspent) {
      return unspent.value + amount
    }, 0)

    if (amount > balance) {
      return callback(new Error('Faucet doesn\'t contain enough RVN to send.'))
    }

    var tx = new bitcoin.TransactionBuilder(bitcoin.networks.testnet, 100000000)
    tx.addOutput(toAddress, amount)

    var change = balance - amount - 20000000
    if (change > 0) {
      tx.addOutput(address, change)
    }

    utxos.forEach(function (unspent) {
      tx.addInput(unspent.txId, unspent.vout)
    })

    utxos.forEach(function (unspent, i) {
      tx.sign(i, keypair)
    })

    var txHex = tx.build().toHex()
    blockchain.transactions.propagate(txHex, function (err, result) {
      if (err) return callback(err)

      callback(null, result.txId)
    })
  })
}

var server = http.createServer(app)

server.listen(PORT, function (err) {
  if (err) console.error(err)
  console.log('\n  ravencoin-faucet listening on port %s', chalk.blue.bold(PORT))
  console.log('  deposit funds to: %s', chalk.green.bold(address))
})
