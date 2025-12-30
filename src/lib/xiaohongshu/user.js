import { renderRss2 } from '../../utils/util';

let getUser = async (url, cookie) => {
	const headers = {
		"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
		"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
		"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
		"Sec-Ch-Ua": '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
		"Sec-Ch-Ua-Mobile": "?0",
		"Sec-Ch-Ua-Platform": '"Windows"',
		"Sec-Fetch-Dest": "document",
		"Sec-Fetch-Mode": "navigate",
		"Sec-Fetch-Site": "none",
		"Sec-Fetch-User": "?1",
		"Upgrade-Insecure-Requests": "1"
	};
	if (cookie) {
		headers['Cookie'] = cookie;
	}
	let res = await fetch(url, {
		headers: headers
	});
	let scripts = [];
	let rewriter = new HTMLRewriter()
		.on('script', {
			element(element) {
				scripts.push('');
			},
			text(text) {
				scripts[scripts.length - 1] += text.text;
			},
		})
		.transform(res);
	await rewriter.text();
	let script = scripts.find((script) => script.startsWith('window.__INITIAL_STATE__='));
	if (!script) {
		throw new Error('Could not find initial state script. Possible captcha or login required.');
	}
	script = script.slice('window.__INITIAL_STATE__='.length);
	// replace undefined to null
	script = script.replace(/undefined/g, 'null');
	let state = JSON.parse(script);
	return state.user;
};

let deal = async (ctx) => {
	// const uid = ctx.params.user_id;
	// const category = ctx.params.category;
	const { uid } = ctx.req.param();
	const cookie = ctx.env?.XIAOHONGSHU_COOKIE;
	const category = 'notes';
	const url = `https://www.xiaohongshu.com/user/profile/${uid}`;

	const {
		userPageData: { basicInfo, interactions, tags },
		notes,
		collect,
	} = await getUser(url, cookie);

	const title = `${basicInfo.nickname} - ${category === 'notes' ? '笔记' : '收藏'} • 小红书 / RED`;
	const description = `${basicInfo.desc} ${tags.map((t) => t.name).join(' ')} ${interactions.map((i) => `${i.count} ${i.name}`).join(' ')}`;
	const image = basicInfo.imageb || basicInfo.images;

	const renderNote = (notes) =>
		notes.flatMap((n) =>
			n.map(({ noteCard }) => ({
				title: noteCard.displayTitle,
				link: `${url}/${noteCard.noteId}`,
				guid: noteCard.displayTitle,
				description: `<img src ="${noteCard.cover.infoList.pop().url}"><br>${noteCard.displayTitle}`,
				author: noteCard.user.nickname,
				upvotes: noteCard.interactInfo.likedCount,
			}))
		);
	const renderCollect = (collect) => {
		if (!collect) {
			throw Error('该用户已设置收藏内容不可见');
		}
		if (collect.code !== 0) {
			throw Error(JSON.stringify(collect));
		}
		if (!collect.data.notes.length) {
			throw ctx.throw(403, '该用户已设置收藏内容不可见');
		}
		return collect.data.notes.map((item) => ({
			title: item.display_title,
			link: `${url}/${item.note_id}`,
			description: `<img src ="${item.cover.info_list.pop().url}"><br>${item.display_title}`,
			author: item.user.nickname,
			upvotes: item.interact_info.likedCount,
		}));
	};

    ctx.header('Content-Type', 'application/xml');
	return ctx.text(
		renderRss2({
			title,
			description,
			image,
			link: url,
			items: category === 'notes' ? renderNote(notes) : renderCollect(collect),
		})
	);
};

let setup = (route) => {
	route.get('/xiaohongshu/user/:uid', deal);
};

export default { setup };
