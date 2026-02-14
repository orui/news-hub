// Static News Generator
const https = require('https');
const fs = require('fs');

class StaticNewsGenerator {
  constructor() {
    this.newsApiKey = '37bec8593888416299df95ed455407f8';
  }

  async generateStaticNews() {
    console.log('📰 Generating static news data...');
    
    try {
      const [newsApiData, guardianData, redditData, weatherData] = await Promise.all([
        this.fetchNewsAPI(),
        this.fetchGuardianNews(),
        this.fetchRedditNews(),
        this.fetchWeather()
      ]);

      const translatedGuardian = this.translateArticles(guardianData);
      const translatedReddit = this.translateArticles(redditData);
      
      const allNews = [...newsApiData, ...translatedGuardian, ...translatedReddit];
      const uniqueNews = this.removeDuplicates(allNews);

      const staticData = {
        news: uniqueNews,
        weather: weatherData,
        lastUpdated: new Date().toISOString(),
        categories: this.categorizeNews(uniqueNews)
      };

      fs.writeFileSync('news-data.json', JSON.stringify(staticData, null, 2));
      console.log('✅ Static news generated');
      
      return staticData;
    } catch (error) {
      console.error('❌ Static generation error:', error);
      return this.generateFallbackData();
    }
  }

  async fetchNewsAPI() {
    const categories = ['general', 'business', 'technology'];
    const promises = categories.map(cat => this.fetchNewsAPICategory(cat));
    const results = await Promise.allSettled(promises);
    
    return results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value);
  }

  async fetchNewsAPICategory(category) {
    const url = `https://newsapi.org/v2/top-headlines?country=jp&category=${category}&pageSize=10&apiKey=${this.newsApiKey}`;
    
    try {
      const response = await this.httpGet(url);
      const data = JSON.parse(response);
      
      if (data.status === 'ok' && data.articles) {
        return data.articles
          .filter(a => a.title && !a.title.includes('[Removed]'))
          .map(article => ({
            title: article.title,
            summary: (article.description || '').substring(0, 150) + '...',
            category: category,
            source: article.source.name,
            time: this.formatTime(article.publishedAt),
            url: article.url,
            image: article.urlToImage,
            language: 'ja'
          }));
      }
    } catch (error) {
      console.error(`NewsAPI ${category} error:`, error);
    }
    
    return [];
  }

  async fetchGuardianNews() {
    const sections = ['world', 'business', 'technology'];
    const promises = sections.map(sec => this.fetchGuardianSection(sec));
    const results = await Promise.allSettled(promises);
    
    return results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value);
  }

  async fetchGuardianSection(section) {
    const url = `https://content.guardianapis.com/search?section=${section}&api-key=test&page-size=5&show-fields=thumbnail`;
    
    try {
      const response = await this.httpGet(url);
      const data = JSON.parse(response);
      
      if (data.response && data.response.results) {
        return data.response.results.map(article => ({
          title: article.webTitle,
          summary: article.webTitle.substring(0, 120) + '...',
          category: section === 'world' ? 'world' : section,
          source: 'The Guardian',
          time: this.formatTime(article.webPublicationDate),
          url: article.webUrl,
          image: article.fields?.thumbnail || null,
          language: 'en'
        }));
      }
    } catch (error) {
      console.error(`Guardian ${section} error:`, error);
    }
    
    return [];
  }

  async fetchRedditNews() {
    const subreddits = ['technology', 'programming', 'worldnews'];
    const promises = subreddits.map(sub => this.fetchRedditSubreddit(sub));
    const results = await Promise.allSettled(promises);
    
    return results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value);
  }

  async fetchRedditSubreddit(subreddit) {
    const url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=5`;
    
    try {
      const response = await this.httpGet(url);
      const data = JSON.parse(response);
      
      if (data.data && data.data.children) {
        return data.data.children
          .filter(post => post.data.score > 50 && !post.data.stickied)
          .map(post => {
            const postData = post.data;
            return {
              title: postData.title,
              summary: `👍 ${postData.score} 💬 ${postData.num_comments} - Reddit discussion`,
              category: subreddit === 'worldnews' ? 'world' : 'technology',
              source: `Reddit r/${subreddit}`,
              time: this.formatTime(new Date(postData.created_utc * 1000).toISOString()),
              url: `https://reddit.com${postData.permalink}`,
              image: null,
              language: 'en'
            };
          });
      }
    } catch (error) {
      console.error(`Reddit ${subreddit} error:`, error);
    }
    
    return [];
  }

  async fetchWeather() {
    try {
      const lat = 35.6762;
      const lon = 139.6503;
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
      
      const response = await this.httpGet(url);
      const data = JSON.parse(response);
      
      if (data.current_weather) {
        return {
          temp: Math.round(data.current_weather.temperature) + '°',
          condition: this.getWeatherIcon(data.current_weather.weathercode) + ' Tokyo'
        };
      }
    } catch (error) {
      console.error('Weather error:', error);
    }

    return { temp: '--°', condition: '🌤️ Tokyo' };
  }

  translateArticles(articles) {
    const translations = {
      'Technology': 'テクノロジー',
      'Business': 'ビジネス',
      'World': '世界',
      'News': 'ニュース',
      'Update': '更新',
      'Report': 'レポート',
      'Analysis': '分析',
      'Market': '市場',
      'Global': 'グローバル',
      'Economy': '経済',
      'Tech': 'テック',
      'Innovation': 'イノベーション',
      'Breaking': '速報',
      'Latest': '最新',
      'New': '新しい',
      'Company': '企業',
      'Apple': 'Apple',
      'Google': 'Google',
      'Microsoft': 'Microsoft'
    };

    return articles.map(article => {
      if (article.language === 'en') {
        let translatedTitle = article.title;
        let translatedSummary = article.summary;
        
        Object.entries(translations).forEach(([en, ja]) => {
          const regex = new RegExp(en, 'gi');
          translatedTitle = translatedTitle.replace(regex, ja);
          translatedSummary = translatedSummary.replace(regex, ja);
        });

        return {
          ...article,
          title: translatedTitle,
          summary: translatedSummary,
          language: 'ja',
          originalLanguage: 'en'
        };
      }
      return article;
    });
  }

  categorizeNews(newsArray) {
    return {
      technology: newsArray.filter(n => n.category === 'technology').slice(0, 10),
      business: newsArray.filter(n => n.category === 'business').slice(0, 10),
      world: newsArray.filter(n => n.category === 'world' || n.category === 'general').slice(0, 10),
      trending: newsArray.filter(n => n.source.includes('Reddit')).slice(0, 5)
    };
  }

  formatTime(isoString) {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMins = Math.floor((now - date) / 60000);
      
      if (diffMins < 60) return `${Math.max(1, diffMins)}分前`;
      if (diffMins < 1440) return `${Math.floor(diffMins / 60)}時間前`;
      return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
    } catch {
      return '最近';
    }
  }

  getWeatherIcon(code) {
    if (code === 0) return '☀️';
    if (code <= 3) return '🌤️';
    if (code <= 48) return '☁️';
    return '🌤️';
  }

  removeDuplicates(articles) {
    const seen = new Set();
    return articles.filter(article => {
      const key = article.title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  generateFallbackData() {
    return {
      news: [
        {
          title: '📰 ニュースダッシュボード準備中',
          summary: '30分毎の自動更新でリアルタイムニュースを提供します',
          category: 'general',
          source: 'News Dashboard',
          time: '稼働中',
          url: '#',
          language: 'ja'
        }
      ],
      weather: { temp: '--°', condition: '🌤️ Tokyo' },
      lastUpdated: new Date().toISOString(),
      categories: { technology: [], business: [], world: [], trending: [] }
    };
  }

  async httpGet(url) {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
  }
}

if (require.main === module) {
  const generator = new StaticNewsGenerator();
  generator.generateStaticNews()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = StaticNewsGenerator;