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
      $rootScope.titleDetail = tx.txid.substring(0,7) + '...';
      $rootScope.flashMessage = null;
      $scope.tx = tx;
      $scope.transactionType = tx.version
      $scope.sidechainId = _sidechainId(tx)
      $scope.sidechainAddress = _sidechainAddress(tx)
      $scope.maturity = tx.certificateState
      $scope.mcDestinationAddress = _mcDestinationAddress(tx)
      _processTX(tx);
      $scope.txs.unshift(tx);
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
