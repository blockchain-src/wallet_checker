const crypto = require('crypto');
globalThis.crypto = crypto;
const { EthWallet } = require('@okxweb3/coin-ethereum');
const { BtcWallet } = require('@okxweb3/coin-bitcoin');
const { SolWallet } = require('@okxweb3/coin-solana');
const { SuiWallet } = require('@okxweb3/coin-sui');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const https = require('https');
const querystring = require('querystring');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// 美化输出
console.log(chalk.green("\n██████╗ ███████╗███╗   ██╗███████╗███████╗ █████╗ "));
console.log(chalk.green("██╔══██╗██╔════╝████╗  ██║██╔════╝██╔════╝██╔══██╗"));
console.log(chalk.green("██████╔╝█████╗  ██╔██╗ ██║█████╗  █████╗  ███████║"));
console.log(chalk.green("██╔═══╝ ██╔══╝  ██║╚██╗██║██╔══╝  ██╔══╝  ██╔══██║"));
console.log(chalk.green("██║     ███████╗██║ ╚████║███████╗███████╗██║  ██║"));
console.log(chalk.green("╚═╝     ╚══════╝╚═╝  ╚═══╝╚══════╝╚══════╝╚═╝  ╚═╝"));
console.log(chalk.yellow("\n🌐  目前支持的钱包私钥类型：EVM、BTC、Solana、Sui"));

// readline 接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let privateKeys = [];
const addressesPath = path.resolve(__dirname, '../.addresses.txt');
const envPath = path.resolve(__dirname, '../.env');

async function generateAddress(privateKey) {
  try {
    let wallet;
    let newAddress;
    let keyWithoutPrefix = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;

    if (keyWithoutPrefix.length === 64 && /^[0-9a-fA-F]+$/.test(keyWithoutPrefix)) {
      wallet = new EthWallet();
      newAddress = await wallet.getNewAddress({ privateKey: '0x' + keyWithoutPrefix });
      console.log(chalk.cyan("♻️  您的 EVM 钱包地址为:") + chalk.green(newAddress.address));
    } else if (/^[5KLc][a-km-zA-HJ-NP-Z1-9]{50,51}$/.test(privateKey)) {
      wallet = new BtcWallet();
      newAddress = await wallet.getNewAddress({ privateKey, addressType: "segwit_taproot" });
      console.log(chalk.cyan("♻️  您的 BTC_Taproot 地址为:") + chalk.green(newAddress.address));
    } else if (/^[1-9A-HJ-NP-Za-km-z]{85,90}$/.test(privateKey)) {
      wallet = new SolWallet();
      newAddress = await wallet.getNewAddress({ privateKey });
      console.log(chalk.cyan("♻️  您的 Solana 钱包地址为:") + chalk.green(newAddress.address));
    } else if (privateKey.startsWith("suiprivkey")) {
      wallet = new SuiWallet();
      newAddress = await wallet.getNewAddress({ privateKey });
      console.log(chalk.cyan("♻️  您的 Sui 钱包地址为:") + chalk.green(newAddress.address));
    } else {
      console.log(chalk.red("❌  无法识别该私钥类型。请检查输入的私钥是否有效。"));
      return;
    }

    fs.appendFileSync(addressesPath, `${newAddress.address}\n`, 'utf-8');
    fs.appendFileSync(envPath, `PRIVATE_KEY=${privateKey}\n`, 'utf-8');
  } catch (error) {
    console.error(chalk.red("❌  生成地址时出错:"), error);
  }
}

console.log(chalk.yellow("🗝️  请输入私钥："));

rl.on('line', (line) => {
  if (line.trim() === '') {
    if (privateKeys.length > 0) {
      rl.close();
    } else {
      console.log(chalk.red("❌  私钥不能为空！请重新输入。"));
    }
  } else {
    privateKeys.push(line.trim());
    console.log(chalk.green("✅  继续输入或按 ENTER 确认。"));
  }
});

rl.on('close', async () => {
  console.log(chalk.yellow("\n🔆  正在获取地址..."));
  fs.writeFileSync(addressesPath, '');
  for (const privateKey of privateKeys) {
    await generateAddress(privateKey);
  }

  const api_config = {
    api_key: process.env.OKX_API_KEY,
    secret_key: process.env.OKX_SECRET_KEY,
    passphrase: process.env.OKX_PASSPHRASE,
    project: process.env.OKX_PROJECT
  };

  const filePath = path.resolve(__dirname, '../.addresses.txt');
  const addresses = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
  const chainsPath = path.resolve(__dirname, '../chains.json');

  let chains;
  try {
    chains = JSON.parse(fs.readFileSync(chainsPath, 'utf-8'));
  } catch (error) {
    console.error(chalk.red.bold(`❌  无法加载链列表: ${error.message}`));
    process.exit(1);
  }

  const delayBetweenRequests = 1000;
  const batchSize = 1;

  function preHash(timestamp, method, request_path, params) {
    let query_string = '';
    if (method === 'GET' && params) {
      query_string = '?' + querystring.stringify(params);
    }
    return timestamp + method + request_path + query_string;
  }

  function sign(message, secret_key) {
    const hmac = crypto.createHmac('sha256', secret_key);
    hmac.update(message);
    return hmac.digest('base64');
  }

  function createSignature(method, request_path, params) {
    const timestamp = new Date().toISOString().slice(0, -5) + 'Z';
    const message = preHash(timestamp, method, request_path, params);
    const signature = sign(message, api_config.secret_key);
    return { signature, timestamp };
  }

  function sendGetRequest(request_path, params, resultsForAddress, retryCount, callback) {
    const { signature, timestamp } = createSignature('GET', request_path, params);

    const headers = {
      'OK-ACCESS-KEY': api_config.api_key,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': api_config.passphrase,
      'OK-ACCESS-PROJECT': api_config.project
    };

    const options = {
      hostname: 'www.okx.com',
      path: request_path + (params ? `?${querystring.stringify(params)}` : ''),
      method: 'GET',
      headers: headers
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsedData = JSON.parse(data);
          if (parsedData.code === '0') {
            const totalValue = parseFloat(parsedData.data[0]?.totalValue || '0');
            if (!isNaN(totalValue)) {
              resultsForAddress.total += totalValue;
            } else {
              console.log(chalk.red(`❌  无效的资产值: ${JSON.stringify(parsedData)}`));
            }
            callback();
          } else if (parsedData.code === '50005') {
            if (retryCount > 0) {
              console.log(chalk.yellow(`❌  请求频率限制，重试中... 剩余重试次数: ${retryCount}`));
              setTimeout(() => sendGetRequest(request_path, params, resultsForAddress, retryCount - 1, callback), delayBetweenRequests);
            } else {
              console.log(chalk.red(`❌  重试失败，跳过查询: ${JSON.stringify(parsedData)}`));
              callback();
            }
          } else {
            callback();
          }
        } catch (error) {
          console.log(chalk.red(`❌  解析失败: ${error.message}`));
          callback();
        }
      });
    });

    req.on('error', (error) => {
      console.log(chalk.red(`❌  请求失败: ${error.message}`));
      if (retryCount > 0) {
        setTimeout(() => sendGetRequest(request_path, params, resultsForAddress, retryCount - 1, callback), delayBetweenRequests);
      } else {
        callback();
      }
    });

    req.end();
  }

  async function batchFetchAssets(addresses, chains) {
    const results = {};

    for (let i = 0; i < addresses.length; i += batchSize) {
      const currentBatch = addresses.slice(i, i + batchSize);

      for (const address of currentBatch) {
        const resultsForAddress = { total: 0 };
        console.log(chalk.blue.bold(`🔍  查询地址: ${address}`));

        for (const chain of chains) {
          const params = {
            address: address,
            chains: chain.id,
            assetType: 0
          };

          await new Promise((resolve) => {
            sendGetRequest('/api/v5/wallet/asset/total-value-by-address', params, resultsForAddress, 3, resolve);
          });
        }

        results[address] = resultsForAddress.total;
        console.log(chalk.green.bold(`💲  该地址的资产估值为: ${resultsForAddress.total.toFixed(2)} `));

        await new Promise((resolve) => setTimeout(resolve, delayBetweenRequests));
      }
    }

    console.log(chalk.yellow.bold('🔆  所有地址查询完毕！'));

    const formattedResults = Object.entries(results).map(([address, balance]) => ({
      '钱包地址': address,
      '资产估值': balance.toFixed(2),
    }));
    console.table(formattedResults);
    const totalAssets = Object.values(results).reduce((sum, balance) => sum + balance, 0);
    console.log(chalk.yellow.bold(`💲  以上所有钱包地址的资产总和为: ${totalAssets.toFixed(2)}`));
  }

  await batchFetchAssets(addresses, chains);
  process.exit(0);
});
