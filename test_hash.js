const crypto = require('crypto');
const initData = "query_id=AAHdF60EAAAAAN0XrQS_QnMy&user=%7B%22id%22%3A78310045%2C%22first_name%22%3A%22Artem%22%2C%22last_name%22%3A%22%22%2C%22username%22%3A%22artem%22%2C%22language_code%22%3A%22en%22%2C%22allows_write_to_pm%22%3Atrue%7D&auth_date=1690000000&hash=1234567890abcdef";
const token = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';

// Method A: key='WebAppData', data=token
const secretA = crypto.createHmac('sha256', 'WebAppData').update(token).digest();

// Method B: key=token, data='WebAppData'
const secretB = crypto.createHmac('sha256', token).update('WebAppData').digest();

console.log("Secret A (hex):", secretA.toString('hex'));
console.log("Secret B (hex):", secretB.toString('hex'));
