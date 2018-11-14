const puppeteer = require('puppeteer');
const mongoose = require('mongoose');
const CREDS = require('./creds');
const User = require('./models/user');

async function run() {
  const browser = await puppeteer.launch({
    headless: false
  });
  const page = await browser.newPage();

  // await page.goto('https://github.com');
  // await page.screenshot({path: 'screenshots/github.png'});

  await page.goto('https://github.com/login');

  // dom element selectors
  const USERNAME_SELECTOR = '#login_field';
  const PASSWORD_SELECTOR = '#password';
  const BUTTON_SELECTOR = '#login > form > div.auth-form-body.mt-3 > input.btn.btn-primary.btn-block';

  await page.type(USERNAME_SELECTOR, CREDS.username);
  await page.type(PASSWORD_SELECTOR, CREDS.password);
  await page.click(BUTTON_SELECTOR);
  await page.waitForNavigation();

  const userToSearch = 'john';
  const searchUrl = 'https://github.com/search?q=' + userToSearch + '&type=Users&utf8=%E2%9C%93';
  // let searchUrl = 'https://github.com/search?utf8=%E2%9C%93&q=bashua&type=Users';

  await page.goto(searchUrl);
  await page.waitFor(2 * 1000);

  const USER_LIST_INFO_SELECTOR = '.user-list-item';
  const USER_LIST_USERNAME_SELECTOR = '.user-list-info>a:nth-child(1)';
  const USER_LIST_EMAIL_SELECTOR = '.user-list-info>.user-list-meta .muted-link';

  const numPages = await getNumPages(page);
  console.log('Numpages: ', numPages);

  for (let h = 1; h <= numPages; h++) {
    // 跳转到指定页码
    await page.goto(`${searchUrl}&p=${h}`);
    // 执行爬取
    const users = await page.evaluate((sInfo, sName, sEmail) => {
      return Array.prototype.slice.apply(document.querySelectorAll(sInfo))
        .map($userListItem => {
          // 用户名
          const username = $userListItem.querySelector(sName).innerText;
          // 邮箱
          const $email = $userListItem.querySelector(sEmail);
          const email = $email ? $email.innerText : undefined;
          return {
            username,
            email,
          };
        })
        // 不是所有用户都显示邮箱
        .filter(u => !!u.email);
    }, USER_LIST_INFO_SELECTOR, USER_LIST_USERNAME_SELECTOR, USER_LIST_EMAIL_SELECTOR);

    users.map(({username, email}) => {
      // 保存用户信息
      upsertUser({
        username: username,
        email: email,
        dateCrawled: new Date()
      });
    });
  }

  // 关闭 puppeteer
  browser.close();

  // TODO: upsertUser 为异步方法，这里并没有等待其完成，纯粹是为了验证 MongoDB 里面是否有数据而已
  showAllCounts();
}

/**
 * 获取页数
 * @param  {Page} page 搜索结果页
 * @return {number}    总页数
 */
async function getNumPages(page) {
  const NUM_USER_SELECTOR = '#js-pjax-container .codesearch-results h3';

  let inner = await page.evaluate((sel) => {
    return document.querySelector(sel).innerHTML;
  }, NUM_USER_SELECTOR);

  // 格式是: "69,803 users"
  inner = inner.replace(',', '').replace(' users', '');
  const numUsers = parseInt(inner);
  console.log('numUsers: ', numUsers);

  /*
   * GitHub 每页显示 10 个结果
   */
  const numPages = Math.ceil(numUsers / 10);
  return numPages;
}

/**
 * 初始化 MongoDB
 */
function initMongoDB() {
  if (mongoose.connection.readyState == 0) {
    const DB_URL = 'mongodb://localhost/thal';
    mongoose.connect(DB_URL);
  }
}

/**
 * 新增或更新用户信息
 * @param  {object} userObj 用户信息
 */
function upsertUser(userObj) {
  initMongoDB();
  // if this email exists, update the entry, don't insert
  // 如果邮箱存在，就更新实例，不新增
  const conditions = {
    email: userObj.email
  };
  const options = {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true
  };

  User.findOneAndUpdate(conditions, userObj, options, (err, result) => {
    if (err) {
      throw err;
    }
  });
}

/**
 * 查找并展示目前有多少已保持的 User
 */
function showAllCounts() {
  initMongoDB();
  User.count({}, function (err, count) {
    if (err) {
      console.error(err);
    }
    console.log('==== There are %d users saved ====', count);
  });
}

run();
