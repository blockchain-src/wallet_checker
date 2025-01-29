const crypto = require('crypto'); 
globalThis.crypto = crypto;
const https = require('https');
const querystring = require('querystring');
const chalk = require('chalk'); // 用于美化输出
const fs = require('fs'); // 用于读取 JSON 文件
const path = require('path');
const Table = require('cli-table3'); // 用于输出表格
const readline = require('readline'); // 用于交互式输入
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// 从 .env 文件中加载 API 配置信息
const api_config = {
    api_key: process.env.OKX_API_KEY,
    secret_key: process.env.OKX_SECRET_KEY,
    passphrase: process.env.OKX_PASSPHRASE,
    project: process.env.OKX_PROJECT
};

// 美化输出
console.log(chalk.green("\n██████╗ ███████╗███╗   ██╗███████╗███████╗ █████╗ "));
console.log(chalk.green("██╔══██╗██╔════╝████╗  ██║██╔════╝██╔════╝██╔══██╗"));
console.log(chalk.green("██████╔╝█████╗  ██╔██╗ ██║█████╗  █████╗  ███████║"));
console.log(chalk.green("██╔═══╝ ██╔══╝  ██║╚██╗██║██╔══╝  ██╔══╝  ██╔══██║"));
console.log(chalk.green("██║     ███████╗██║ ╚████║███████╗███████╗██║  ██║"));
console.log(chalk.green("╚═╝     ╚══════╝╚═╝  ╚═══╝╚══════╝╚══════╝╚═╝  ╚═╝"));
console.log(chalk.yellow("\n💥  支持查询所有链的钱包地址！"));

// 创建 readline 接口，提示用户输入地址
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.question('♻️  请输入查询的钱包地址（支持所有链的地址）: ', (address) => {
    if (!address) {
        console.error(chalk.red.bold('❌  请提供有效的地址'));
        rl.close();
        process.exit(1);
    }

    console.log(chalk.blue.bold('⏳  请稍等片刻，数据正在读取中......'));

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

    function delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async function sendGetRequest(request_path, params, chainName, results, table) {
        const { signature, timestamp } = createSignature("GET", request_path, params);

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

        return new Promise((resolve) => {
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    try {
                        const parsedData = JSON.parse(data);

                        if (parsedData.code === '0') { // 假设 '0' 是成功的返回码
                            const totalValue = parseFloat(parsedData.data[0]?.totalValue || '0');
                            if (totalValue > 0) { // 只显示资产估值大于 0 的链
                                table.push([chalk.green(chainName), chalk.yellow(totalValue.toFixed(2))]);
                                results.total += totalValue;
                            }
                        } else {
                            console.error(chalk.red(`❌  链 ${chainName} 查询失败: ${parsedData.msg || '未知错误'}`));
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

    const request_path = '/api/v5/wallet/asset/total-value-by-address';

    const chainsPath = path.resolve(__dirname, '../chains.json');
    let chains;
    try {
        chains = JSON.parse(fs.readFileSync(chainsPath, 'utf-8'));
    } catch (error) {
        console.error(chalk.red.bold(`❌  无法加载链列表: ${error.message}`));
        rl.close();
        process.exit(1);
    }

    const results = { total: 0 };
    const table = new Table({
        head: ['链名称', '资产估值'],
        style: { head: ['green'], border: ['yellow'] }
    });

    async function processChains() {
        for (const chain of chains) {
            const params = {
                address: address,
                chains: chain.id,
                assetType: 0
            };
            await sendGetRequest(request_path, params, chain.name, results, table);
            await delay(100); // 延迟 100 毫秒
        }

        // 打印最终结果
        console.log(chalk.blue.bold(`🔍  查询地址: ${address}`));
        if (table.length > 0) {
            console.log(table.toString());
        } else {
            console.log(chalk.yellow.bold('⚠️  未找到任何资产估值大于 0 的链'));
        }
        console.log(chalk.magenta.bold(`💲  该地址的所有链的总资产估值为: ${results.total.toFixed(2)}`));
        rl.close();
    }

    processChains();
});
