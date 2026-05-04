// ============================================================
// 데모 데이터 - API 키 없이 파이프라인 테스트용 (Reddit 전용)
// ============================================================

import type { RedditPost } from './types/index.js'

export const demoRedditPosts: RedditPost[] = [
  {
    id: 'demo1', subreddit: 'kdramas',
    title: 'Just finished "When the Stars Gossip" and I am OBSESSED - anyone else?',
    url: 'https://www.reddit.com/r/kdramas/comments/demo1/', score: 2341, commentCount: 187,
    createdAt: new Date(Date.now() - 2 * 3600000).toISOString(), flair: 'Discussion',
    comments: [
      { id: 'c1', body: 'The chemistry between the leads is absolutely insane. Best drama of 2025 so far!', score: 432, depth: 0 },
      { id: 'c2', body: 'Gong Hyo-jin is carrying this show. Her comedic timing is perfect.', score: 287, depth: 0 },
      { id: 'c3', body: 'If you like this, watch "My Mister" - similar vibes but more serious.', score: 198, depth: 1 },
    ]
  },
  {
    id: 'demo2', subreddit: 'kdramas',
    title: 'Recommend me something similar to "Squid Game" - intense, survival, thriller',
    url: 'https://www.reddit.com/r/kdramas/comments/demo2/', score: 1876, commentCount: 234,
    createdAt: new Date(Date.now() - 5 * 3600000).toISOString(), flair: 'Recommendations',
    comments: [
      { id: 'c4', body: '"Sweet Home" season 3 just dropped and its incredible', score: 521, depth: 0 },
      { id: 'c5', body: 'Try "Signal" or "Voice" - great thrillers', score: 312, depth: 0 },
      { id: 'c6', body: '"Juvenile Justice" on Netflix is underrated and intense', score: 201, depth: 0 },
    ]
  },
  {
    id: 'demo3', subreddit: 'kdrama',
    title: '"My Mister" rewatch - still the best Korean drama ever made, change my mind',
    url: 'https://www.reddit.com/r/kdrama/comments/demo3/', score: 3102, commentCount: 412,
    createdAt: new Date(Date.now() - 8 * 3600000).toISOString(), flair: 'Review',
    comments: [
      { id: 'c7', body: "My Mister transcends the kdrama genre entirely. IU's performance is career-defining.", score: 876, depth: 0 },
      { id: 'c8', body: 'Agreed, I recommend this to everyone regardless of whether they watch kdramas', score: 543, depth: 0 },
    ]
  },
  {
    id: 'demo4', subreddit: 'kdramarecommends',
    title: 'Looking for dramas with strong female leads like "Crash Landing on You"',
    url: 'https://www.reddit.com/r/kdramarecommends/comments/demo4/', score: 987, commentCount: 156,
    createdAt: new Date(Date.now() - 12 * 3600000).toISOString(), flair: 'Request',
    comments: [
      { id: 'c9', body: "\"It's Okay to Not Be Okay\" - Seo Ye-ji is a powerhouse", score: 342, depth: 0 },
      { id: 'c10', body: 'Have you seen "Mr. Sunshine"? Incredible female lead and cinematography', score: 287, depth: 0 },
    ]
  },
  {
    id: 'demo5', subreddit: 'kdramas',
    title: 'Squid Game Season 2 vs Season 1 - honest thoughts after full rewatch',
    url: 'https://www.reddit.com/r/kdramas/comments/demo5/', score: 4521, commentCount: 623,
    createdAt: new Date(Date.now() - 18 * 3600000).toISOString(), flair: 'Discussion',
    comments: [
      { id: 'c11', body: 'Season 1 is objectively better but S2 has its moments. The ending sets up S3 perfectly.', score: 1021, depth: 0 },
      { id: 'c12', body: 'Fight scene choreography improved massively in S2 though', score: 654, depth: 0 },
    ]
  },
  {
    id: 'demo6', subreddit: 'korean',
    title: 'Best way to learn Korean through dramas? Intermediate learner here',
    url: 'https://www.reddit.com/r/korean/comments/demo6/', score: 743, commentCount: 89,
    createdAt: new Date(Date.now() - 24 * 3600000).toISOString(), flair: 'Learning',
    comments: [
      { id: 'c13', body: 'Start with slice of life dramas - Reply 1988 is perfect for natural Korean', score: 321, depth: 0 },
      { id: 'c14', body: 'Use Language Reactor extension with Netflix - game changer for Korean study', score: 287, depth: 0 },
    ]
  },
  {
    id: 'demo7', subreddit: 'kdramas',
    title: '"Lovely Runner" just became my all-time favorite - the ending destroyed me',
    url: 'https://www.reddit.com/r/kdramas/comments/demo7/', score: 2876, commentCount: 334,
    createdAt: new Date(Date.now() - 36 * 3600000).toISOString(), flair: 'Review',
    comments: [
      { id: 'c15', body: 'Byeon Woo-seok was absolutely robbed at every award ceremony', score: 654, depth: 0 },
      { id: 'c16', body: 'The time travel plot was actually coherent unlike most dramas', score: 432, depth: 0 },
    ]
  },
  {
    id: 'demo8', subreddit: 'kdramas',
    title: "Why is \"Pachinko\" season 2 not talked about more?? It's masterpiece level",
    url: 'https://www.reddit.com/r/kdramas/comments/demo8/', score: 1654, commentCount: 201,
    createdAt: new Date(Date.now() - 48 * 3600000).toISOString(), flair: 'Discussion',
    comments: [
      { id: 'c17', body: 'Pachinko deserves every award. The generational storytelling is unmatched.', score: 487, depth: 0 },
      { id: 'c18', body: 'Lee Min-ho in period drama is absolutely it', score: 312, depth: 0 },
    ]
  },
  {
    id: 'demo9', subreddit: 'koreatravel',
    title: 'Seoul travel guide - filming locations from my favorite kdramas!',
    url: 'https://www.reddit.com/r/koreatravel/comments/demo9/', score: 892, commentCount: 67,
    createdAt: new Date(Date.now() - 6 * 3600000).toISOString(), flair: 'Travel Tips',
    comments: [
      { id: 'c19', body: 'Bukchon Hanok Village from Crash Landing on You is beautiful in person', score: 234, depth: 0 },
    ]
  },
  {
    id: 'demo10', subreddit: 'kdramas',
    title: '"Squid Game" season 3 trailer reaction - community thoughts',
    url: 'https://www.reddit.com/r/kdramas/comments/demo10/', score: 5234, commentCount: 789,
    createdAt: new Date(Date.now() - 1 * 3600000).toISOString(), flair: 'News',
    comments: [
      { id: 'c20', body: 'The trailer alone broke Netflix records. This is going to be insane.', score: 1432, depth: 0 },
      { id: 'c21', body: 'June cannot come fast enough', score: 876, depth: 0 },
    ]
  },
]
