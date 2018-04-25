const app = new (require('koa'))();
const router = require('koa-router')();
const NodeCache = require('node-cache');
const koaStatic = require('koa-static');
const jwt = require('jsonwebtoken');
const config = require('./consts/config');
const {duration, key, expiresIn, pluginName, port} = config;
const plugin = require(pluginName);
const {encrypt, decrypt} = require('./utils/aes');
const sha256 = require('./utils/sha256');

const tokensCache = new NodeCache();
const truthCache = new NodeCache();

app.use(koaStatic('./static_custom'));
app.use(koaStatic('./static'));
app.use(require('koa-bodyparser')());
app.use(require('koa-respond')());

// TODO replace everything with post
router.post('/key', async function createKey(ctx) {
	const {user, params} = ctx.request.body;
	const timestamp = Math.floor(new Date().getTime()/1000);
	const i = Math.floor(timestamp/duration);
	const mi = duration*i;
	const mi1 = duration*(i+1);
	const ni = duration*i - duration/2;
	const ni1 = duration*(i+1) - duration/2;
	let z = null;
	if(timestamp >= mi && ni1 > timestamp) {
		z = sha256(user + mi + mi1);
	} else if(timestamp >= ni1 && timestamp <= mi1) {
    z = sha256(user + ni + ni1);
	} else {
		throw Error('undefined timestamp');
	}

	const token = jwt.sign({u: user, p: params}, key, {expiresIn});
	const zp = encrypt(z);
	tokensCache.set(z, token, duration);
	ctx.ok({zp});
	// TODO queue system may me useful here
	// TODO params may define plugins we need, in some cases - email, in another - sms
	plugin({user, params, z, config});
});

router.get('/key/verify/:z', async function verifyAndGetToken(ctx) {
	const z = ctx.params.z;
	// TODO check how library works, get operation might be blocking
	const token = tokensCache.get(z);
	if(token) {
		ctx.ok({token});
		truthCache.set(z, true, duration);
	} else {
		ctx.send(403);
	}
});

router.get('/token/:zp', async function getToken(ctx) {
	const zp = ctx.params.zp;
	const z = decrypt(zp);
	if(truthCache.get(z)) {
		const token = tokensCache.get(z);
		ctx.ok({token});
		truthCache.del(z);
		tokensCache.del(z);
	} else {
		ctx.forbidden();
	}
});

router.get('/token/status/:token', async function getTokenStatus(ctx) {
	const token = ctx.params.token;
	jwt.verify(token, key, function(err, decoded) {
	  if (err) {
	  	ctx.forbidden();
	  } else {
	  	ctx.ok();
	  }
	});
});

app.use(router.routes());
app.listen(port);
console.log(`AuthMagic is running on port ${port}`);