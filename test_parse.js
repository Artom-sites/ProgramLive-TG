const initData = "query_id=AAHdF60EAAAAAN0XrQS_QnMy&user=%7B%22id%22%3A78310045%2C%22first_name%22%3A%22Artem%22%2C%22last_name%22%3A%22%22%2C%22username%22%3A%22artem%22%2C%22language_code%22%3A%22en%22%2C%22allows_write_to_pm%22%3Atrue%7D&auth_date=1690000000&hash=1234567890abcdef";

const params = new URLSearchParams(initData);
const hash = params.get('hash');
params.delete('hash');
const keys = Array.from(params.keys()).sort();
const dataCheckString = keys.map(k => \`\${k}=\${params.get(k)}\`).join('\\n');
console.log(dataCheckString);
