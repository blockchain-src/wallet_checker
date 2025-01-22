const { EthWallet } = require('@okxweb3/coin-ethereum');
const { BtcWallet } = require('@okxweb3/coin-bitcoin');
const { SolWallet } = require('@okxweb3/coin-solana');
const { SuiWallet } = require('@okxweb3/coin-sui');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const https = require('https');
const crypto = require('crypto');
const querystring = require('querystring');
const Table = require('cli-table3');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// 创建 readline 接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 美化输出
console.log(chalk.green("\n██████╗ ███████╗███╗   ██╗███████╗███████╗ █████╗ "));
console.log(chalk.green("██╔══██╗██╔════╝████╗  ██║██╔════╝██╔════╝██╔══██╗"));
console.log(chalk.green("██████╔╝█████╗  ██╔██╗ ██║█████╗  █████╗  ███████║"));
console.log(chalk.green("██╔═══╝ ██╔══╝  ██║╚██╗██║██╔══╝  ██╔══╝  ██╔══██║"));
console.log(chalk.green("██║     ███████╗██║ ╚████║███████╗███████╗██║  ██║"));
console.log(chalk.green("╚═╝     ╚══════╝╚═╝  ╚═══╝╚══════╝╚══════╝╚═╝  ╚═╝"));
console.log(chalk.yellow("\n🌐  目前支持的钱包私钥类型：EVM、BTC、Solana、Sui"));

async function generateAddress(privateKey) {
  try {
    let wallet;
    let newAddress;
    let addressType;

    let keyWithoutPrefix = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;

    if (keyWithoutPrefix.length === 64 && /^[0-9a-fA-F]+$/.test(keyWithoutPrefix)) {
      wallet = new EthWallet();
      newAddress = await wallet.getNewAddress({ privateKey: '0x' + keyWithoutPrefix });
      addressType = "EVM";
      console.log(chalk.cyan("♻️  您的 EVM 钱包地址为:") + chalk.green(newAddress.address));
    } else if (/^[5KLc][a-km-zA-HJ-NP-Z1-9]{50,51}$/.test(privateKey)) {
      wallet = new BtcWallet();
      const params = { privateKey: privateKey, addressType: "segwit_taproot" };
      newAddress = await wallet.getNewAddress(params);
      addressType = "BTC";
      console.log(chalk.cyan("♻️  您的 BTC_Taproot 地址为:") + chalk.green(newAddress.address));
    } else if (/^[1-9A-HJ-NP-Za-km-z]{85,90}$/.test(privateKey)) {
      wallet = new SolWallet();
      const params = { privateKey };
      newAddress = await wallet.getNewAddress(params);
      addressType = "Solana";
      console.log(chalk.cyan("♻️  您的 Solana 钱包地址为:") + chalk.green(newAddress.address));
    } else if (privateKey.startsWith("suiprivkey")) {
      wallet = new SuiWallet();
      newAddress = await wallet.getNewAddress({ privateKey });
      addressType = "Sui";
      console.log(chalk.cyan("♻️  您的 Sui 钱包地址为:") + chalk.green(newAddress.address));
    } else {
      console.log(chalk.red("❌  无法识别该私钥类型。请检查输入的私钥是否有效。"));
      return;
    }

    const envPath = path.resolve(__dirname, '../.env');
    const envData = fs.readFileSync(envPath, 'utf-8');
    const privateKeyKey = `${addressType}_PRIVATE_KEY`;
    const privateKeyLine = `${privateKeyKey}=${privateKey}\n`;

    if (!envData.includes(privateKeyKey)) {
      fs.appendFileSync(envPath, privateKeyLine, 'utf-8');
    }

    queryAddress(newAddress.address);
  } catch (error) {
    console.error(chalk.red("❌  生成地址时出错:"), error);
  }
}

async function queryAddress(address) {
  console.log(chalk.blue.bold('⏳  正在查询该地址的资产，请稍等......'));

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
    const signature = sign(message, process.env.OKX_SECRET_KEY);
    return { signature, timestamp };
  }

  const request_path = '/api/v5/wallet/asset/total-value-by-address';
  const chainsPath = path.resolve(__dirname, '../chains.json');
  let chains;

  try {
    chains = JSON.parse(fs.readFileSync(chainsPath, 'utf-8'));
  } catch (error) {
    console.error(chalk.red.bold(`❌  无法加载链列表: ${error.message}`));
    process.exit(1);
  }

  const results = { total: 0 };
  const table = new Table({
    head: ['链名称', '资产估值'],
    style: { head: ['green'], border: ['yellow'] }
  });

  async function sendGetRequest(request_path, params, chainName) {
    const { signature, timestamp } = createSignature("GET", request_path, params);

    const headers = {
      'OK-ACCESS-KEY': process.env.OKX_API_KEY,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': process.env.OKX_PASSPHRASE,
      'OK-ACCESS-PROJECT': process.env.OKX_PROJECT
    };

    const options = {
      hostname: 'www.okx.com',
      path: request_path + (params ? `?${querystring.stringify(params)}` : ''),
      method: 'GET',
      headers: headers
    };

    return new Promise((resolve) => {
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
              if (totalValue > 0) {
                table.push([chalk.green(chainName), chalk.yellow(totalValue.toFixed(2))]);
                results.total += totalValue;
              }
            } else {
             
            }
          } catch (error) {
            console.error(chalk.red(`❌  链 ${chainName} 数据解析失败: ${error.message}`));
          }
          resolve();
        });
      });

      req.on('error', (error) => {
        console.error(chalk.red(`❌  链 ${chainName} 请求失败: ${error.message}`));
        resolve();
      });

      req.end();
    });
  }

  async function processChains() {
    for (const chain of chains) {
      const params = {
        address: address,
        chains: chain.id,
        assetType: 0
      };
      await sendGetRequest(request_path, params, chain.name);
    }

    console.log(chalk.blue.bold(`🔍  查询地址: ${address}`));
    if (table.length > 0) {
      console.log(table.toString());
    } else {
      console.log(chalk.yellow.bold('⚠️  未找到任何资产！'));
    }
    console.log(chalk.magenta.bold(`💲  该地址的所有链的总资产估值为: ${results.total.toFixed(2)}`));
    console.log(chalk.yellow("\n====================================================================="));

    rl.question(chalk.yellow("是否需要查询其它钱包资产？(y/n): "), (answer) => {
      if (answer.toLowerCase() === 'y') {
        rl.question(chalk.yellow("🗝️  请输入钱包私钥：") + " ", (privateKey) => {
          if (!privateKey) {
            console.log(chalk.red("❌  私钥不能为空！"));
            rl.close();
          } else {
            generateAddress(privateKey);
          }
        });
      } else {
        rl.close();
      }
    });
  }

  await processChains();
}

rl.question(chalk.yellow("🗝️  请输入钱包私钥：") + " ", (privateKey) => {
  if (!privateKey) {
    console.log(chalk.red("❌  私钥不能为空！"));
    rl.close();
  } else {
    generateAddress(privateKey);
  }
});
