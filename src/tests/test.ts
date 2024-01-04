import { igApi } from '../index';

const cookie = 'cookie';

const proxyConfig = {
	protocol: 'http',
	host: '0.0.0.0',
	port: 3000,
	auth: {
		username: 'xxxx',
		password: 'xxxx',
	},
};

const ig = new igApi(cookie, proxyConfig);

(async () => {
	const url = 'randomInstaPost';
	const response = await ig.fetchPost(url);

	console.log(response);
})();