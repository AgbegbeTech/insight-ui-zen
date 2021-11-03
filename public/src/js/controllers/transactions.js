'use strict';

angular.module('insight.transactions').controller('transactionsController',
function($scope, $rootScope, $routeParams, $location, Global, Transaction, TransactionsByBlock, TransactionsByAddress) {
  $scope.global = Global;
  $scope.loading = false;
  $scope.loadedBy = null;

  var pageNum = 0;
  var pagesTotal = 1;
  var COIN = 100000000;

  var _aggregateItems = function(items) {
    if (!items) return [];

    var l = items.length;

    var ret = [];
    var tmp = {};
    var u = 0;

    for(var i=0; i < l; i++) {

      var notAddr = false;
      // non standard input
      if (items[i].scriptSig && !items[i].addr) {
        items[i].addr = 'Unparsed address [' + u++ + ']';
        items[i].notAddr = true;
        notAddr = true;
      }

      // non standard output
      if (items[i].scriptPubKey && !items[i].scriptPubKey.addresses) {
        items[i].scriptPubKey.addresses = ['Unparsed address [' + u++ + ']'];
        items[i].notAddr = true;
        notAddr = true;
      }

      // multiple addr at output
      if (items[i].scriptPubKey && items[i].scriptPubKey.addresses.length > 1) {
        items[i].addr = items[i].scriptPubKey.addresses.join(',');
        ret.push(items[i]);
        continue;
      }

      var addr = items[i].addr || (items[i].scriptPubKey && items[i].scriptPubKey.addresses[0]);

      if (!tmp[addr]) {
        tmp[addr] = {};
        tmp[addr].valueSat = 0;
        tmp[addr].count = 0;
        tmp[addr].addr = addr;
        tmp[addr].items = [];
      }
      tmp[addr].isSpent = items[i].spentTxId;

      tmp[addr].doubleSpentTxID = tmp[addr].doubleSpentTxID   || items[i].doubleSpentTxID;
      tmp[addr].doubleSpentIndex = tmp[addr].doubleSpentIndex || items[i].doubleSpentIndex;
      tmp[addr].dbError = tmp[addr].dbError || items[i].dbError;
      tmp[addr].valueSat += Math.round(items[i].value * COIN);
      tmp[addr].items.push(items[i]);
      tmp[addr].notAddr = notAddr;

      if (items[i].unconfirmedInput)
        tmp[addr].unconfirmedInput = true;

      tmp[addr].count++;
    }

    angular.forEach(tmp, function(v) {
      v.value    = v.value || parseInt(v.valueSat) / COIN;
      ret.push(v);
    });
    return ret;
  };

  var _processTX = function(tx) {
    tx.vinSimple = _aggregateItems(tx.vin);
    tx.voutSimple = _aggregateItems(tx.vout);
  };

  var _paginate = function(data) {
    $scope.loading = false;

    pagesTotal = data.pagesTotal;
    pageNum += 1;

    data.txs.forEach(function(tx) {
      _processTX(tx);
      $scope.txs.push(tx);
    });
  };

  var _byBlock = function() {
    TransactionsByBlock.get({
      block: $routeParams.blockHash,
      pageNum: pageNum
    }, function(data) {
      _paginate(data);
    });
  };

  var _byAddress = function () {
    TransactionsByAddress.get({
      address: $routeParams.addrStr,
      pageNum: pageNum
    }, function(data) {
      _paginate(data);
    });
  };

  var _transactionType = function (version) {
    switch (version) {
      case 1:
        return 'TRANSPARENT_TX';
      case 2:
        return 'SHIELDED_TX_OLD';
      case -3:
        return 'SHIELDED_TX';
      case -4:
        return 'SIDECHAIN_TX';
      case -5:
        return 'CERTIFICATE';
    }
  }

  var _sidechainId = function (transaction) {
    // This is the case for: Sidechain creation TX, version: -4
    // https://explorer-testnet.horizen.io/api/tx/c205cc95d71dd7f008fe8691a79781b9d0a25ddfa2d34f367839d73b02b3e3a5

    if (transaction.vsc_ccout && transaction.vsc_ccout.length > 0) {
      return transaction.vsc_ccout[0]["scid"]
    }

    // This is the case for: MC -> SC Forward Transfer TX, version: -4
    // https://explorer-testnet.horizen.io/api/tx/e07a3bcbdfad4b022a3f2802bb57f6445abf82daee7f076b6e39f3f6406e9848

    if (transaction.vft_ccout && transaction.vft_ccout.length > 0) {
      return transaction.vft_ccout[0]["scid"]
    }

    // This is the case for:
    // SC Certificate no Backward Transfer, version: -5
    // https://explorer-testnet.horizen.io/api/tx/bd395e052108d10405e5ccf917706f3600a58f3c48f11d4cdd9803d68bed24f2
    // SC -> MC Certificate with Backward Transfer, version: -5
    // https://explorer-testnet.horizen.io/api/tx/410a983c24f14bc0c2bef11c3274f399b99f32235742da8b3eca1ebb2986146f

    if (transaction.cert) {
      return transaction.cert["scid"]
    }

    // MC Backward Transfer Request, version: -4
    if (transaction.vmbtr_out && transaction.vmbtr_out.length > 0) {
      return transaction.vmbtr_out[0]["scid"]
    }

    // Ceased Sidechain Withdrawal, version: -4
    if (transaction.vcsw_ccin && transaction.vcsw_ccin.length > 0) {
      return transaction.vcsw_ccin[0]["scid"]
    }

    return null
  }

  var _sidechainAddress = function (transaction) {
    // This is the case for: Sidechain creation TX, version: -4
    if (transaction.vsc_ccout && transaction.vsc_ccout.length > 0) {
      return transaction.vsc_ccout[0]["address"]
    }

    // This is the case for: MC -> SC Forward Transfer TX, version: -4
    if (transaction.vft_ccout && transaction.vft_ccout.length > 0) {
      return transaction.vft_ccout[0]["address"]
    }

    return null
  }

  var _mcDestinationAddress = function (transaction) {
    // MC Backward Transfer Request, version: -4
    if (transaction.vmbtr_out && transaction.vmbtr_out.length > 0) {
      return transaction.vmbtr_out[0]["mcDestinationAddress"]
    }

    return null
  }

  var _findTx = function(txid) {
    Transaction.get({
      txId: txid
    }, function(tx) {
      var tx2 = JSON.parse(
        '{"txid":"bd395e052108d10405e5ccf917706f3600a58f3c48f11d4cdd9803d68bed24f2","version":-5,"locktime":0,"vin":[{"txid":"fd04343d8bfdbc6565f66c3c1940e927ca03b5b7c8b30fc4d8f3ea12c4d0417a","vout":0,"sequence":4294967295,"n":0,"scriptSig":{"hex":"47304402201e361bb73e42b7dcb71e644bd191f009fddabbfd1782683aeb3452880291190102206fadd52616518a21d9599f807c5abfdc8e9a974c72969b6e071d667ce99159a90121036cda72878f999d49502b29737e7a708dffa4f6198f7cbec18f07ae3874b06a50","asm":"304402201e361bb73e42b7dcb71e644bd191f009fddabbfd1782683aeb3452880291190102206fadd52616518a21d9599f807c5abfdc8e9a974c72969b6e071d667ce99159a901 036cda72878f999d49502b29737e7a708dffa4f6198f7cbec18f07ae3874b06a50"},"addr":"ztphoWCQmyJVuNq2L3SLnRgy2Lw5i5a7hxL","valueSat":297799949794,"valueZat":297799949794,"value":2977.99949794,"doubleSpentTxID":null}],"vout":[{"value":"2977.99948794","n":0,"scriptPubKey":{"hex":"76a914ec6039c0505e74b8f74fb1e22b77da64d30ce6b388ac20a975e6c1ba29f90821c40ca9590c5b4ded3cc855d4e0c40ddd73ab753f7e000003084f0eb4","asm":"OP_DUP OP_HASH160 ec6039c0505e74b8f74fb1e22b77da64d30ce6b3 OP_EQUALVERIFY OP_CHECKSIG a975e6c1ba29f90821c40ca9590c5b4ded3cc855d4e0c40ddd73ab753f7e0000 937736 OP_CHECKBLOCKATHEIGHT","addresses":["ztphoWCQmyJVuNq2L3SLnRgy2Lw5i5a7hxL"],"type":"pubkeyhash"},"spentTxId":null,"spentIndex":null,"spentHeight":null}],"blockhash":"00025ff8c83bca8e7356f100d821d7be621fd054387f4ca7a887ce354687e589","blockheight":938038,"confirmations":8071,"time":1634722513,"blocktime":1634722513,"valueOut":2977.99948794,"size":2730,"valueIn":2977.99949794,"fees":0.00001,"cert":{"scid":"1a4d5813b260d0cb456c649b005840e1a1eb6eb2e0f98f3af7d201ea1e95d0b8","epochNumber":4,"quality":5,"endEpochCumScTxCommTreeRoot":"09e2240ad05862bfceee141681c5c8c0e536566f104ad04ff18c7a78fcd9193d","scProof":"0201f2a439b9e7516e18ccafd0cab30f90222cce272a013001c6e38a7b00cddf9c2280000155d00977a7a433152c62094766ca65337ad2c4b62c4607b8808c0e299f52c600800001d4439b9ca42eff5f55ca2e265166e296821bd81a7fd07e7e0ef96ad25fb99c39800001d129c4117fc7a87046880c3e2033030949ce6c639bd0604699e1f95c5bf3103e00000109857bc9a94449415f4c01820804f96bfb44595a2e6a9897ec11145ca8f3330200000157823fb28a9c29354824f3413a5c7e2d79cb6ef4944ea8fec2647e5a3bc7c93700000186e3455b452eec416317242d046c70e66f0e303b2bdab412610d002e1820b23d000003620d7a55c8f3a6416d94f97227194397ff81b5bfed020d0f1e7e7505290b1d2800f46fe5974372d3a6ac3ce3a3b633b4e2bf0f2996da3853aacb144a6500cc0930805d7e702872c80e17ea78a8cea1904e45186daeeb9782f6319c0f7505b14ce62c80001af3aa1f75e3823b6d75bdb1c31af849be33cc901f5896a424f0af0071760028953514f317f4667b7a5199d2c3b242b47fa40c6b075cdbe65865303fafb5df07a14b792b6830f197e8aec36a7b210d8104dc8a615c1ccfee2acbab3441e0382d0fcb15bc277392a4c1b912bd5e9619ff6b0f08deb41c782b042802f5b0bc0f3181a71638be565ed607c0e02cb17b378a86103e47692c681c871cdf878e7d31188d3f576248a3816d83d1c71d3e60a2511fb3873bed2cee508ac53b25c8b9ba1d316e04b497d03a860cb4ae1dd1f53d42ba687afeb4e3ae09ae473d59d1f32231ff81b9a5bd34634a440c9dac391503c04cc8ac1eac74b847da3a806ac9fdcc1c780cc075730aaee14e6b36f39a28e9ef0c9cfac135a8753565314ac0e066ca3a8d95dbd6adc91a341d2584d989eae5d8959d9b6a5608ef4419e6df6b47d403155da72d26243f68302dbabcceb4fbf8a256356917ea4b1d72f3b28c4a4a6cbc3e60d73702fe513b0ddd91411d03ca9a30070ad0b653724e7a662d3498390ed40e2c3dc99ba4bcea2f2a11f501f2d5e47ae4d44c9b2bf97ed75691f914a211c02ce1c878879b6fcb555a031d6ad023f342910c13453316f469bcc0562947ad4337b917505df1d600d5d1e8289ef960bc1107a553663ada8bc609eb17f26836e11c15bb60c8b9cb1c9c97e99b47aaad82253e8b58549a631ea6daf1a5b49ed561253e03e7b4d62178e837f4c3755cc9350a9424168c738666e932a336a7018cb9287aea83c2813e3c8b007f47825bfd821863577ebc5ff6486a5bcfb6cabf0fb815eaa3c618d21445072263de12ad9712e4367ce07e8ba0eec74912eb1358e92b25a66b3e4ed740ef879a2b57e09f09ae6e26499d78c5b6e0fab30da43762e2bc0249775973465dfe9aee18d7aab3273a6d77e69f82a665dcaf56907aa5f27ecf1e79137d55791c8f5a145d330900f928b3ca5b683c00d0c14de9417a030d7d5d031127d8c96aeadda0511c9f491de2607cd4a891ea59fb41728eeb8f58a3e4f4251e8008e4191102ede7081d94ca8322eee3b573477ac4106a0a2dce56c9b90fbd451c00614ff0fcd4b084ca189896771cc60c2ccfaf566fa244d7b4a97e6f91768ee03200786917f7e0bf284fa2ee9c5a1068a15d3e0b12b53f389f22b37afc20f9c97811809c87ee46e22aba87eebe13d6c98506e8ea2019081f9bc4b1d753c5301c56283980d06df8ed6321c2be359fe0aaab42d5a6a50c9f232f727f6fb0b9a2b960151c0880764a9664d47c6fe7804cf158e570d496edc3eb8dd5c6f3b0bf0225c60552073c00502fe9dfc5106c4e9f2dcb95969ab37558e083e316a761999e5cc282b623850200664b7724c1bce12c95881139b0882f45f47477c093623004ac25e92fb2fdac1600cc49e74e8d3ebe22b2b3452897f0fe35a5adffd79dc8d96c390c9c142dbbb6168076ecac4d8f32a8b9dbc539ea254cfbaf16a61c59f747af98b404be31d6c1390100772d169e808feb83cc66e46d52d234d4a781db2b610c4c5b2354131516f2152100f05a3d6e2bea8d2ffb80cf86107eb574ce04c8cd00b07f335fe74b9a548fd01b00e0463ef13996e0f8498bff807fdb30e4150884030c7b8b848561f2f472eb1d06804cc7c0b1807a6a8bb2f72bba32190f0e5b3ebad72979d43e9ebdd37bc1467121801759cdf4b1070bbe07832047ffe24e2155829ff0e025853d1c21f4439ba32b0b001577157e7f40ced3b78d5d2a52e183dd6995384cec02df119ef9e25a8070e0140084c74d8b16dcf762bd2d74b705d1648bba2b11a83922ed1d3e73bc6662bd9c0000eb9172a264298293a2545b00c7458aec229114c043a987667c2158706cd64c2a80cfea1e1292b1d1c9dfb5c794bec51c3afc23174201f728933c0f352238ebab1080b53569d947d015cd1944127e128781de6ca30a1b2d383a61819124ca5834fb350022523298ed7f58be925758e5bcfd87bae4ec1ee39f86be8288b7b85e252ebd31802140f1d097848cbe750932bc7405391e4d37d7da1b6509f0a9f9548d397296098025ca3a6edecf35492cb2913637050341a416e3358855f9809494a7463823651800c7e30313758a11267c0c3f81891d5e625a484e531bce6226c331e58adef5641b00e305e64b70422f1d3a392fe44e80de00198485ffc8fa1580250b321e598a7f1f80c7a823633e42fa057f2355a5202d85f171e24fa3d1076f348dfc63ce2b78700b00ee6de7fd1be17569df0d7e1402e3b3b8c5a874f4df9bc4f99309b48cbaa3f51300557c9177262d5f6daf99c3ee19bced0200c446d10364d35ec55a1e2ce89a70010032e6aba941f6c34097b9397dbc209f7e11314eac2d22bd6b16d231afac32ee3b006b9bd90db00ad793903a87bff9441f9dd285513449f0c4f3dc2a9b0de997652e800904c04fdb96836235bcc6e908d7ac55bf89fde7e754421a59d895503353f626803c96e2e239f40ab960989aee22a24f96aef7db4775e1b05d3348da200490012300dc4f5d03f4ac278ebe8578f607a5b8d242e12ce9156434e0bdf5670e3947902300a3677ad0d4dc8497b4c8bb13cc6948543254957c0fed9eadbefcdfbd9771ed3e00ff6a679a57b09bb7c7cdd3dd3863bb39cb9bae1daf6bb1491820639c81fa9b380197be39bed6f61b8576a4dbfe631c149171bae0de1139234b35083e9f8bf27b13800102ed593fceec454e3e9f620e9d1058ba8bc40f16da56e00044b706db1e1cdc21036a8316604f7c6b42236d3528c8f0d2617d52aee9496b9cd3e4bda098439b222e00f01b416b0fa7d6c4f80d829f08062769c99bc0cd5e567777f8b97668d1264b368068fe98fe594cee50fa842f7e267c07e4ceca7a5d29c9173fd6a4d048f1804e2980","vFieldElementCertificateField":[],"vBitVectorCertificateField":[],"ftScFee":0,"mbtrScFee":0,"totalAmount":0},"maturityHeight":938155,"blocksToMaturity":0,"certificateState":"MATURE"}'
        )
        console.log(tx2)
        console.log(_sidechainId)
        console.log(_sidechainAddress)
        console.log(tx)
      $rootScope.titleDetail = tx2.txid.substring(0,7) + '...';
      $rootScope.flashMessage = null;
      $scope.tx = tx2;
      $scope.transactionType = _transactionType(tx2.version)
      $scope.sidechainId = _sidechainId(tx2)
      $scope.sidechainAddress = _sidechainAddress(tx2)
      $scope.maturity = tx2.certificateState
      $scope.mcDestinationAddress = _mcDestinationAddress(tx2)
      _processTX(tx2);
      $scope.txs.unshift(tx2);
    }, function(e) {
      if (e.status === 400) {
        $rootScope.flashMessage = 'Invalid Transaction ID: ' + $routeParams.txId;
      }
      else if (e.status === 503) {
        $rootScope.flashMessage = 'Backend Error. ' + e.data;
      }
      else {
        $rootScope.flashMessage = 'Transaction Not Found';
      }

      $location.path('/');
    });
  };

  $scope.findThis = function() {
    _findTx($routeParams.txId);
  };

  //Initial load
  $scope.load = function(from) {
    $scope.loadedBy = from;
    $scope.loadMore();
  };

  //Load more transactions for pagination
  $scope.loadMore = function() {
    if (pageNum < pagesTotal && !$scope.loading) {
      $scope.loading = true;

      if ($scope.loadedBy === 'address') {
        _byAddress();
      }
      else {
        _byBlock();
      }
    }
  };

  // Highlighted txout
  if ($routeParams.v_type == '>' || $routeParams.v_type == '<') {
    $scope.from_vin = $routeParams.v_type == '<' ? true : false;
    $scope.from_vout = $routeParams.v_type == '>' ? true : false;
    $scope.v_index = parseInt($routeParams.v_index);
    $scope.itemsExpanded = true;
  }
  
  //Init without txs
  $scope.txs = [];

  $scope.$on('tx', function(event, txid) {
    _findTx(txid);
  });

});

angular.module('insight.transactions').controller('SendRawTransactionController',
  function($scope, $http) {
  $scope.transaction = '';
  $scope.status = 'ready';  // ready|loading|sent|error
  $scope.txid = '';
  $scope.error = null;

  $scope.formValid = function() {
    return !!$scope.transaction;
  };
  $scope.send = function() {
    var postData = {
      rawtx: $scope.transaction
    };
    $scope.status = 'loading';
    $http.post(window.apiPrefix + '/tx/send', postData)
      .success(function(data, status, headers, config) {
        if(typeof(data.txid) != 'string') {
          // API returned 200 but the format is not known
          $scope.status = 'error';
          $scope.error = 'The transaction was sent but no transaction id was got back';
          return;
        }

        $scope.status = 'sent';
        $scope.txid = data.txid;
      })
      .error(function(data, status, headers, config) {
        $scope.status = 'error';
        if(data) {
          $scope.error = data;
        } else {
          $scope.error = "No error message given (connection error?)"
        }
      });
  };
});
