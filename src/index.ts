/* eslint-disable no-useless-catch */
/* eslint-disable no-shadow */
/* Muhamad Ristiyanto _ https://github.com/Gimenz
 * Created, Published at Selasa, 9 Maret 2021
 * Modified, Updated at Minggu, 20 Februari 2022
 */

import fs, { PathLike } from 'fs';
import FormData from 'form-data';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { bufferToStream, getPostType, parseCookie, randInt, shortcodeFormatter } from './utils/index';
import { username, userId, seachTerm, url, IgCookie, ProductType, MediaType, IChangedProfilePicture } from './types';
import { IGUserMetadata, UserGraphQL } from './types/UserMetadata';
import { CookieHandler } from './helper/CookieHandler';
import { IGStoriesMetadata, ItemStories, StoriesGraphQL } from './types/StoriesMetadata';
import { highlight_ids_query, highlight_media_query } from './helper/query';
import { HightlighGraphQL, ReelsIds } from './types/HighlightMetadata';
import { HMedia, IHighlightsMetadata, IReelsMetadata, ReelsMediaData } from './types/HighlightMediaMetadata';
import { IPostModels, IRawBody, MediaUrls } from './types/PostModels';
import { config } from './config';
import { getCsrfToken } from './helper/Session';
import { PostFeedResult } from './types/PostFeedResult';
import { PostStoryResult } from './types/PostStoryResult';
import { MediaConfigureOptions } from './types/MediaConfigureOptions';
import { GraphqlUser } from './types/UserGraphQlV2';
import { IPaginatedPosts } from './types/PaginatedPosts';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { getCookie } from './helper/Session';
import { proxyType, authType, newSessionType, MainResponse } from './types/LoginData';

export * from './utils';
export * as InstagramMetadata from './types';
export * from './helper/Session';
export class igApi {
	public options = {};
	public proxyAgent;

	/**
	 * Recommended to set cookie for most all IG Request
	 * @param IgCookie cookie you can get it by using getSessionId function, see README.md or example file
	 * @param storeCookie
	 * @param fetchOptions
	 */
	constructor(private IgCookie: IgCookie = '', public storeCookie: boolean = true, public fetchOptions = {}, public proxy: proxyType, public auth?: authType) {
		this.IgCookie = IgCookie;
		this.fetchOptions = fetchOptions;

		if (auth?.user) {
			this.auth = { user: auth.user, pass: auth.pass };
		}

		if (this.storeCookie) {
			this.setCookie(this.IgCookie);
		}

		if (proxy) {
			this.proxy = proxy;
			const proxyAgent = new HttpsProxyAgent(
				`${this.proxy.protocol}://${Object.keys(this.proxy.auth || {}).length > 0 ? `${this.proxy.auth?.username}:${this.proxy.auth?.password}` : ''}@${this.proxy.host}:${this.proxy.port}`,
			);
			this.proxyAgent = proxyAgent;
		}
	}
	private cookie = new CookieHandler(this.IgCookie);
	private accountUserId = this.IgCookie.match(/sessionid=(.*?);/)?.[1].split('%')[0] || '';

	private buildHeaders = (agent: string = config.android, options?: any) => {
		return {
			'user-agent': agent,
			'cookie': `${this.storeCookie && this.cookie.get() || this.IgCookie}`,
			'authority': 'www.instagram.com',
			'content-type': 'application/x-www-form-urlencoded',
			'origin': 'https://www.instagram.com',
			'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
			'sec-fetch-site': 'same-origin',
			'sec-fetch-mode': 'cors',
			'sec-fetch-dest': 'empty',
			'x-ig-app-id': 936619743392459,
			'x-ig-www-claim': 'hmac.AR3W0DThY2Mu5Fag4sW5u3RhaR3qhFD_5wvYbOJOD9qaPjIf',
			'x-instagram-ajax': 1,
			'x-requested-with': 'XMLHttpRequest',
			...options,
		};
	};

	/**
	 * Make request to IG API
	 * @param baseURL
	 * @param url
	 * @param agent
	 * @param AxiosOptions
	 */
	private FetchIGAPI = async (
		baseURL: string,
		url = '',
		agent = 'config.android',
		fetchOptions: AxiosRequestConfig = {},
	): Promise<{ newSession: newSessionType, response: AxiosResponse | undefined }> => {
		try {
			const headers = fetchOptions.headers || this.buildHeaders(agent);

			const options: AxiosRequestConfig = {
				method: fetchOptions.method || 'GET',
				headers,
			};

			if (this.proxyAgent) {
				options.httpsAgent = this.proxyAgent;
			}
	
			this.options = options;
	
			const res: MainResponse = await axios(`${baseURL}${url}`, options)
				.then(async (res) => {
					if (!res?.data?.items?.length && !res?.data?.graphql?.user && !res?.data?.data?.user && this.auth) {
						console.log('getting new session cookie...');
						const data = await this.getNewSession(this.auth);
	
						if (data.status === true) {
							const newHeaders = fetchOptions.headers || this.buildHeaders(agent);
							options.headers = newHeaders;
	
							const newRes = await axios(`${baseURL}${url}`, options);
							return {
								newSession: data,
								response: newRes,
							};
						}
					}
					return {
						newSession: { status: false },
						response: res,
					};
				})
				.catch(async (error) => {
					if (error.response && error.response.status === 400) {
						return {
							newSession: { status: false },
							response: 'Request failed, account has been locked by instagram',
						};
					}
					if (error.response && error.response.status === 401 && this.auth) {
						console.log('getting new session cookie...');
						const data = await this.getNewSession(this.auth);
	
						if (data.status === true) {
							const newHeaders = fetchOptions.headers || this.buildHeaders(agent);
							options.headers = newHeaders;
	
							const newRes = await axios(`${baseURL}${url}`, options);
							return {
								newSession: data,
								response: newRes,
							};
						}
						else {
							return error;
						}
					}
					else {
						throw error;
					}
				});

			return {
				newSession: res.newSession,
				response: res.response,
			};
	
		}
		catch(e) {
			console.log(e);
			return { newSession: { status: false }, response: undefined };
		}
	};
	

	/**
	 * Set cookie for most all IG Request
	 * @param {IgCookie} IgCookie
	 */
	private setCookie = (IgCookie: IgCookie = this.IgCookie) => {
		try {
			if (!this.cookie.check()) {
				this.cookie.save(IgCookie);
			}
			else {
				this.cookie.update(IgCookie);
			}
		}
		catch (error) {
			throw error;
		}
	};

	private getNewSession = async (creds: authType) => {
		try {
			const newCookie = await getCookie(creds.user, creds.pass, this.proxyAgent) as string;
			this.IgCookie = newCookie;
			return {
				status: true,
				cookies: newCookie,
			};
		}
		catch(e) {
			console.error('Invalid login provided', e);
			return {
				status: false,
			};
		}
	};

	/**
	 * get user id by username
	 * @param {username} username
	 * @returns
	 */
	public getIdByUsername = async (username: username): Promise<{ newSession: newSessionType, data: string }> => {
		const res = await this.FetchIGAPI(
			'https://i.instagram.com/api/v1/users/web_profile_info',
			// `/${username}/?__a=1&__d=dis`,
			`/?username=${username}`,
			config.iPhone,
		);

		if (res?.response?.data?.status === 400) {
			return {
				newSession: { status: false },
				data: 'Request failed, account has been locked by instagram',
			};
		}

		return {
			newSession: res.newSession,
			data: res?.response?.data?.data?.user?.id || res,
		};
	};

	public searchFollower = async (userId: userId, seachTerm: seachTerm): Promise<{ newSession: newSessionType, data: AxiosResponse | string }> => {
		const res = await this.FetchIGAPI(
			config.instagram_base_url,
			`/api/v1/friendships/${userId}/followers/?count=12&query=${seachTerm}&search_surface=follow_list_page`,
			config.iPhone,
		);

		if (res?.response?.data?.status === 400) {
			return {
				newSession: { status: false },
				data: 'Request failed, account has been locked by instagram',
			};
		}

		return {
			newSession: res.newSession,
			data: res.response?.data,
		};
	};

	public searchFollowing = async (userId: userId, seachTerm: seachTerm): Promise<{ newSession: newSessionType, data: AxiosResponse | string }> => {
		const res = await this.FetchIGAPI(
			config.instagram_base_url,
			`/api/v1/friendships/${userId}/following/?query=${seachTerm}`,
			config.iPhone,
		);

		if (res?.response?.data?.status === 400) {
			return {
				newSession: { status: false },
				data: 'Request failed, account has been locked by instagram',
			};
		}

		return {
			newSession: res.newSession,
			data: res.response?.data,
		};
	};

	private _formatSidecar = (data: IRawBody): Array<MediaUrls> => {
		const gql = data.items[0];
		const urls: MediaUrls[] = [];
		if (gql.product_type == ProductType.CAROUSEL) {
			gql.carousel_media.forEach((v, i, a) => {
				urls.push({
					id: v.id,
					url: v.media_type == MediaType.IMAGE ? v.image_versions2.candidates[0].url : v.video_versions?.[0].url || '',
					type: v.media_type == MediaType.IMAGE ? 'image' : 'video',
					dimensions: {
						height: v.media_type == MediaType.IMAGE ? v.image_versions2.candidates[0].height : v.video_versions?.[0].height || 0,
						width: v.media_type == MediaType.IMAGE ? v.image_versions2.candidates[0].width : v.video_versions?.[0].width || 0,
					},
				});
			});
		}
		else if (gql.product_type == ProductType.REEL) {
			urls.push({
				id: gql.id,
				url: gql.video_versions[0].url,
				type: 'video',
				dimensions: {
					height: gql.video_versions[0].height,
					width: gql.video_versions[0].width,
				},
			});
		}
		else if (gql.product_type == ProductType.TV) {
			urls.push({
				id: gql.id,
				url: gql.video_versions[0].url,
				type: 'video',
				dimensions: {
					height: gql.video_versions[0].height,
					width: gql.video_versions[0].width,
				},
			});
		}
		else if (gql.product_type == ProductType.SINGLE) {
			urls.push({
				id: gql.id,
				url: gql.media_type == MediaType.IMAGE ? gql.image_versions2.candidates[0].url : gql.video_versions?.[0].url || '',
				type: gql.media_type == MediaType.IMAGE ? 'image' : 'video',
				dimensions: {
					height: gql.media_type == MediaType.IMAGE ? gql.image_versions2.candidates[0].height : gql.video_versions?.[0].height || 0,
					width: gql.media_type == MediaType.IMAGE ? gql.image_versions2.candidates[0].width : gql.video_versions?.[0].width || 0,
				},
			});
		}
		return urls;
	};

	public fetchPost = async (url: url): Promise<{ newSession: newSessionType, data: IPostModels | string }> => {
		const post = shortcodeFormatter(url);

		// const req = (await IGFetchDesktop.get(`/${post.type}/${post.shortcode}/?__a=1`))
		const res = await this.FetchIGAPI(
			config.instagram_base_url,
			`/${post.type}/${post.shortcode}/?__a=1&__d=dis`,
			config.desktop,
		).catch(error => {
			console.log(error);
			if (error.request._isRedirect) {
				return axios.request({
					...this.options,
					url: error.request._options.path,
				});
			}
		});

		if ((res as any)?.response?.data?.status === 400) {
			return {
				newSession: { status: false },
				data: 'Request failed, account has been locked by instagram',
			};
		}

		const metadata: IRawBody = (res as any)?.response?.data;
		const item = metadata.items[0];
		return {
			newSession: (res as any).newSession,
			data: {
				username: item.user.username,
				name: item.user.full_name,
				postType: getPostType(item.product_type),
				media_id: item.id,
				shortcode: item.code,
				taken_at_timestamp: item.taken_at,
				likes: item.like_count,
				caption: item.caption?.text || null,
				media_count: item.product_type == ProductType.CAROUSEL ? item.carousel_media_count : 1,
				comment_count: item.comment_count,
				video_duration: item?.video_duration || null,
				music: item?.clips_metadata || null,
				links: this._formatSidecar(metadata),
			},
		};
	};

	public fetchPostByMediaId = async (
		mediaId: string | number,
	): Promise<{ newSession: newSessionType, data: AxiosResponse | string }> => {
		try {
			const res = await this.FetchIGAPI(
				config.instagram_api_v1,
				`/media/${mediaId.toString()}/info/`,
			);

			if (res?.response?.data?.status === 400) {
				return {
					newSession: { status: false },
					data: 'Request failed, account has been locked by instagram',
				};
			}

			return {
				newSession: res.newSession,
				data: res.response?.data,
			};
		}
		catch (error) {
			throw error;
		}
	};

	/**
	 * fetch client account profile
	 */
	public accountInfo = async (
		userID: string = this.accountUserId,
	): Promise<{ newSession: newSessionType, data: object | string }> => {
		try {
			const res = await this.FetchIGAPI(
				config.instagram_api_v1,
				`/users/${userID}/info/`,
			);

			if (res?.response?.data?.status === 400) {
				return {
					newSession: { status: false },
					data: 'Request failed, account has been locked by instagram',
				};
			}

			const graphql: UserGraphQL = res.response?.data;
			return {
				newSession: res.newSession,
				data: graphql,
			};
		}
		catch (error) {
			throw error;
		}
	};

	/**
	 * fetch profile by username. including email, phone number
	 * @param {username} username
	 * @param {boolean} simplifiedMetadata if set to false, it will return full of json result from api request. default is set to true
	 * @returns {Promise<IGUserMetadata>}
	 */
	public fetchUser = async (username: username, simplifiedMetadata = true): Promise<{ newSession: newSessionType, data: UserGraphQL | IGUserMetadata | string }> => {
		const userID = await this.getIdByUsername(username);

		if (userID?.data === 'Request failed, account has been locked by instagram') {
			return {
				newSession: { status: false },
				data: 'Request failed, account has been locked by instagram',
			};
		}

		const res = await this.FetchIGAPI(
			config.instagram_api_v1,
			`/users/${userID}/info/`,
		);

		const obj: any = {
			newSession: res.newSession,
		};

		const graphql: UserGraphQL = res.response?.data;
		const isSet: boolean = typeof graphql.user.full_name !== 'undefined';
		if (!simplifiedMetadata) {
			obj.data = graphql;
			return obj;
		}
		else {
			obj.data = {
				id: graphql.user.pk,
				username: graphql.user.username,
				fullname: graphql.user.full_name,
				followers: graphql.user.follower_count,
				following: graphql.user.following_count,
				post_count: graphql.user.media_count,
				is_private: graphql.user.is_private,
				is_verified: graphql.user.is_verified,
				biography: graphql.user.biography,
				external_url: graphql.user.external_url,
				total_igtv_videos: graphql.user.total_igtv_videos,
				has_videos: graphql.user.has_videos,
				hd_profile_pic_url_info: graphql.user.hd_profile_pic_url_info,
				has_highlight_reels: graphql.user.has_highlight_reels,
				has_guides: graphql.user.has_guides,
				is_business: graphql.user.is_business,
				contact_phone_number: graphql.user.contact_phone_number,
				public_email: graphql.user.public_email,
				account_type: graphql.user.account_type,
			} as IGUserMetadata;

			return obj;
		}
	};

	/**
	 * this do request same as /?__a=1
	 * @param username
	 * @returns
	 */
	public fetchUserV2 = async (username: username) => {
		const res = await this.FetchIGAPI(config.instagram_base_url, `/${username}/?__a=1&__d=dis`);
		// eslint-disable-next-line no-unsafe-optional-chaining
		const graphql: GraphqlUser = res?.response?.data;
		return {
			newSession: res.newSession,
			data: graphql,
		};
	};

	/**
	 * simple method to check is user follow me
	 * @param username
	 * @returns true if user is follow me
	 */
	public isFollowMe = async (username: username): Promise<boolean> => {
		const user = await this.fetchUserV2(username).then(res => res.data);
		return user.follows_viewer;
	};

	/**
	 *
	 * @param {StoriesGraphQL} metadata
	 * @returns {ItemStories[]}
	 */
	private _parseStories = (metadata: StoriesGraphQL): ItemStories[] => {
		const items = metadata.items;
		const storyList: ItemStories[] = [];

		for (let i = 0; i < items.length; i++) {
			const currentItem = items[i];
		
			if (currentItem.media_type === 1) {
				storyList.push({
					type: 1,
					mimetype: 'image/jpeg',
					url: currentItem.image_versions2.candidates[0].url,
					taken_at: currentItem.taken_at,
					expiring_at: currentItem.expiring_at,
					id: currentItem.id,
					original_width: currentItem.original_width,
					original_height: currentItem.original_height,
					has_audio: currentItem.has_audio !== undefined ? currentItem.has_audio : false,
					video_duration: currentItem.video_duration !== undefined ? currentItem.video_duration : null,
					caption: currentItem.caption as unknown as string,
				});
			}
			else {
				storyList.push({
					type: 2,
					mimetype: 'video/mp4',
					url: currentItem.video_versions[0].url,
					taken_at: currentItem.taken_at,
					expiring_at: currentItem.expiring_at,
					id: currentItem.id,
					original_width: currentItem.original_width,
					original_height: currentItem.original_height,
					has_audio: currentItem.has_audio !== undefined ? currentItem.has_audio : false,
					video_duration: currentItem.video_duration !== undefined ? currentItem.video_duration : 0,
					caption: currentItem.caption as unknown as string,
				});
			}
		}

		return storyList;
	};

	/**
	 * fetches stories metadata
	 * @param {string} username username target to fetch the stories, also work with private profile if you use cookie \w your account that follows target account
	 * @returns
	 */
	public fetchStories = async (username: username): Promise<{ newSession: newSessionType, data: IGStoriesMetadata | string }> => {
		const resUsername = await this.getIdByUsername(username) as any;

		if (resUsername?.data === 'Request failed, account has been locked by instagram') {
			return {
				newSession: { status: false },
				data: 'Request failed, account has been locked by instagram',
			};
		}

		const userID = resUsername.data;
		const newSess = resUsername.newSession;
		const res = await this.FetchIGAPI(
			config.instagram_api_v1,
			`/feed/user/${userID}/reel_media/`,
			config.iPhone,
		);

		const graphql: StoriesGraphQL = res.response?.data;
		const isFollowing = typeof graphql?.user?.friendship_status !== 'undefined';

		if (!isFollowing && graphql.user.is_private) {
			throw new Error('Private profile');
		}
		else {
			return {
				newSession: newSess,
				data: {
					username: graphql.user.username,
					stories_count: graphql.media_count,
					stories: graphql.items.length == 0 ? null : this._parseStories(graphql),
					graphql,
				},
			};
		}
	};

	/**
	 * Fetch all reels/highlight id
	 * @param {username} username
	 * @returns
	 */
	public _getReelsIds = async (username: username): Promise<{ newSession: newSessionType, data: ReelsIds[] | string }> => {
		const userID = await this.getIdByUsername(username);

		if (userID?.data === 'Request failed, account has been locked by instagram') {
			return {
				newSession: { status: false },
				data: 'Request failed, account has been locked by instagram',
			};
		}

		const highlightIdsQueryParams = highlight_ids_query(userID.data as string);
		const queryParams = new URLSearchParams(highlightIdsQueryParams);
		const queryString = queryParams.toString();

		const res = await this.FetchIGAPI(
			config.instagram_base_url,
			'/graphql/query/?' + queryString,
			config.iPhone,
		);

		const graphql: HightlighGraphQL = res.response?.data;
		const items: ReelsIds[] | PromiseLike<ReelsIds[]> = [];
		graphql.data.user.edge_highlight_reels.edges.map((edge) => {
			items.push({
				highlight_id: edge.node.id,
				cover: edge.node.cover_media.thumbnail_src,
				title: edge.node.title,
			});
		});
		return {
			newSession: res.newSession,
			data: items,
		};
	};

	/**
	 * get media urls from highlight id
	 * @param {ids} ids of highlight
	 * @returns
	 */
	public _getReels = async (ids: string): Promise<{ newSession: newSessionType, data: ReelsMediaData[] | string }> => {
		const query = highlight_media_query(ids);
		const queryString = new URLSearchParams(query).toString();
	
		const url = `${config.instagram_base_url}/graphql/query/?${queryString}`;
	
		const res = await this.FetchIGAPI(
			url,
			'',
			config.iPhone,
		);

		if (res?.response?.data?.status === 400) {
			return {
				newSession: { status: false },
				data: 'Request failed, account has been locked by instagram',
			};
		}
		
		const graphql: HMedia = res.response?.data;
		const result: ReelsMediaData[] = graphql.data.reels_media[0].items.map((item) => ({
			media_id: item.id,
			mimetype: item.is_video ? 'video/mp4' || 'video/gif' : 'image/jpeg',
			taken_at: item.taken_at_timestamp,
			type: item.is_video ? 'video' : 'image',
			url: item.is_video ? item.video_resources[0].src : item.display_url,
			dimensions: item.dimensions,
		}));

		return {
			newSession: res.newSession,
			data: result,
		};
	};

	/**
	 * fetches highlight metadata
	 * @param {string} username username target to fetch the highlights, also work with private profile if you use cookie \w your account that follows target account
	 * @returns
	 */
	public fetchHighlights = async (username: username): Promise<{ newSession: newSessionType, data: IHighlightsMetadata | string }> => {
		try {
			const ids = await this._getReelsIds(username);

			if (ids?.data === 'Request failed, account has been locked by instagram') {
				return {
					newSession: { status: false },
					data: 'Request failed, account has been locked by instagram',
				};
			}

			ids.data = ids.data as ReelsIds[];

			const reels = await Promise.all((ids).data.map(x => this._getReels(x.highlight_id).then(res => res.data)));

			const data: IReelsMetadata[] = [];
			for (let i = 0; i < reels.length; i++) {
				data.push({
					title: ids.data[i].title,
					cover: ids.data[i].cover,
					media_count: reels[i].length,
					highlights_id: ids.data[i].highlight_id,
					highlights: reels[i] as ReelsMediaData[],
				});
			}
			const json: IHighlightsMetadata = {
				username,
				highlights_count: ids.data.length,
				data: data,
			};

			return {
				newSession: ids.newSession,
				data: json,
			};
		}
		catch (error) {
			throw error;
		}
	};

	/**
	 * fetches user posts, with pagination
	 * @deprecated Does not return all information about a post, use fetchUserPostsV2()
	 * @param username
	 * @param end_cursor get end_cursor by fetch user posts first
	 * @returns
	 */
	public fetchUserPosts = async (username: username, end_cursor = ''): Promise<{ newSession: newSessionType, data: IPaginatedPosts | string }> => {
		const userId = await this.getIdByUsername(username) as any;

		if (userId?.data === 'Request failed, account has been locked by instagram') {
			return {
				newSession: { status: false },
				data: 'Request failed, account has been locked by instagram',
			};
		}

		const queryParams = new URLSearchParams({
			query_id: '17880160963012870',
			id: userId,
			first: '12',
			after: end_cursor,
		}).toString();

		const url = `${config.instagram_base_url}/graphql/query/?${queryParams}`;

		const res = await this.FetchIGAPI(
			url,
			'',
			config.android,
		);

		return {
			newSession: res.newSession,
			data: res?.response?.data?.user.edge_owner_to_timeline_media,
		};

	};

	/**
	 * fetches user posts, with pagination
	 * @param username
	 * @param end_cursor get end_cursor by fetchUserPostsV2 first
	 * @returns
	 */

	public fetchUserPostsV2 = async (username: username, end_cursor = ''): Promise<{ newSession: newSessionType, data: IPaginatedPosts | string }> => {
		const userId = await this.getIdByUsername(username);

		if (userId?.data === 'Request failed, account has been locked by instagram') {
			return {
				newSession: { status: false },
				data: 'Request failed, account has been locked by instagram',
			};
		}
		
		const params = {
			query_hash: '69cba40317214236af40e7efa697781d',
			variables: JSON.stringify({
				id: userId,
				first: 12,
				after: end_cursor,
			}),
		};
	
		const queryParams = new URLSearchParams(params).toString();
		const url = `${config.instagram_base_url}/graphql/query/?${queryParams}`;
	
		const res = await this.FetchIGAPI(
			url,
			'',
			config.android,
		);

		return {
			newSession: res.newSession,
			data: res?.response?.data.user.edge_owner_to_timeline_media,
		};
	};

	private uploadPhoto = async (photo: string | Buffer) => {
		try {
			const uploadId = Date.now();

			const file = Buffer.isBuffer(photo)
				? photo
				: fs.existsSync(photo)
					? fs.readFileSync(photo)
					: photo;

			const uploadParams = {
				media_type: 1,
				upload_id: uploadId.toString(),
				upload_media_height: 1080,
				upload_media_width: 1080,
				xsharing_user_ids: JSON.stringify([]),
				image_compression: JSON.stringify({
					lib_name: 'moz',
					lib_version: '3.1.m',
					quality: '80',
				}),
			};

			const nameEntity = `${uploadId}_0_${randInt(1000000000, 9999999999)}`;

			const headers = {
				'x-entity-type': 'image/jpeg',
				offset: 0,
				'x-entity-name': nameEntity,
				'x-instagram-rupload-params': JSON.stringify(uploadParams),
				'x-entity-length': Buffer.byteLength(file),
				'Content-Length': Buffer.byteLength(file),
				'Content-Type': 'application/octet-stream',
				'x-ig-app-id': '1217981644879628',
				'Accept-Encoding': 'gzip',
				'X-Pigeon-Rawclienttime': (Date.now() / 1000).toFixed(3),
				'X-IG-Connection-Speed': `${randInt(3700, 1000)}kbps`,
				'X-IG-Bandwidth-Speed-KBPS': '-1.000',
				'X-IG-Bandwidth-TotalBytes-B': '0',
				'X-IG-Bandwidth-TotalTime-MS': '0',
			};

			const headersPhoto = this.buildHeaders(config.android, headers);

			const result = await this.FetchIGAPI(
				`${config.instagram_base_url}`,
				`/rupload_igphoto/fb_uploader_${nameEntity}`,
				config.android,
				{ headers: headersPhoto, data: file, method: 'POST' },
			);

			return {
				newSession: result.newSession,
				data: result.response?.data,
			};

		}
		catch (error) {
			throw error;
		}
	};

	/**
	 * Post a photo to instagram
	 * @param photo file path or Buffer
	 * @param type post type
	 * @param options
	 * @returns
	 */
	public addPost = async (photo: string | Buffer, type: 'feed' | 'story' = 'feed', options: MediaConfigureOptions): Promise<{ newSession: newSessionType, data: PostFeedResult | PostStoryResult | string }> => {
		if (!this.IgCookie) throw new Error('set cookie first to use this function');
		try {
			const dateObj = new Date();
			const now = dateObj
				.toISOString()
				.replace(/T/, ' ')
				.replace(/\..+/, ' ');
			const offset = dateObj.getTimezoneOffset();

			const responseUpload = await this.uploadPhoto(photo);

			const payloadForm = {
				upload_id: (responseUpload.data as any).upload_id,
				timezone_offset: offset,
				date_time_original: now,
				date_time_digitalized: now,
				source_type: '4',
				// edits: {
				//     crop_original_size: [1080, 1080],
				//     crop_center: [0.0, -0.0],
				//     crop_zoom: 1.0
				// },
				...options,
			};

			const headers = {
				'authority': 'www.instagram.com',
				'x-ig-www-claim': 'hmac.AR2-43UfYbG2ZZLxh-BQ8N0rqGa-hESkcmxat2RqMAXejXE3',
				'x-instagram-ajax': 'adb961e446b7-hot',
				'content-type': 'application/x-www-form-urlencoded',
				'accept': '*/*',
				'user-agent': config.desktop,
				'x-requested-with': 'XMLHttpRequest',
				'x-csrftoken': parseCookie(this.IgCookie).csrftoken,
				'x-ig-app-id': '1217981644879628',
				'origin': 'https://www.instagram.com',
				'sec-fetch-site': 'same-origin',
				'sec-fetch-mode': 'cors',
				'sec-fetch-dest': 'empty',
				'referer': 'https://www.instagram.com/',
				'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
				'cookie': `${this.storeCookie && this.cookie.get() || this.IgCookie}`,
			};

			const result = await this.FetchIGAPI(
				`${config.instagram_api_v1}`,
				`/media/${type === 'feed' ? 'configure/' : 'configure_to_story/'}`,
				config.android,
				{ data: new URLSearchParams(Object.entries(payloadForm)).toString(), method: 'POST', headers: headers },
			);

			if (result?.response?.data?.status === 400) {
				return {
					newSession: { status: false },
					data: 'Request failed, account has been locked by instagram',
				};
			}

			return {
				newSession: result.newSession,
				data: result.response?.data,
			};

		}
		catch (error) {
			throw error;
		}
	};

	/**
	*
	* @param photo input must be filepath or buffer
	*/
	public changeProfilePicture = async (photo: string | Buffer): Promise<{ newSession: newSessionType; data: IChangedProfilePicture | string; }> => {
		const media = Buffer.isBuffer(photo) ? bufferToStream(photo) : fs.createReadStream(photo);

		const form = new FormData();
		form.append('profile_pic', media, 'profilepic.jpg');

		const headers = this.buildHeaders(
			config.desktop,
			{
				'X-CSRFToken': await getCsrfToken(),
				...form.getHeaders(),
			},
		);
		const result = await this.FetchIGAPI(config.instagram_base_url, '/accounts/web_change_profile_picture/', config.desktop, {
			method: 'post',
			data: form,
			headers,
		});

		if (result?.response?.data?.status === 400) {
			return {
				newSession: { status: false },
				data: 'Request failed, account has been locked by instagram',
			};
		}

		return {
			newSession: result.newSession,
			data: result.response?.data,
		};
	};
}
