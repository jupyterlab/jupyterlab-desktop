// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { BrowserView, ipcMain, shell } from 'electron';
import { MainWindow } from '../mainwindow/mainwindow';
import { DarkThemeBGColor, LightThemeBGColor } from '../utils';
import * as path from 'path';
import * as fs from 'fs';
import fetch from 'node-fetch';
import { XMLParser } from 'fast-xml-parser';

interface INewsItem {
  title: string;
  link: string;
}

export class WelcomeView {
  constructor(parent: MainWindow) {
    this._parent = parent;
    this._view = new BrowserView({
      webPreferences: {
        preload: path.join(__dirname, './preload.js'),
        devTools: process.env.NODE_ENV === 'development'
      }
    });

    const jupyterlabWordmarkSrc = fs.readFileSync(
      path.join(__dirname, '../../../app-assets/jupyterlab-wordmark.svg')
    );

    this._pageSource = `
      <!DOCTYPE html>
      <!--
      Copyright (c) Jupyter Development Team.
      Distributed under the terms of the Modified BSD License.
      
      // control box SVGs from https://github.com/AlexTorresSk/custom-electron-titlebar
      -->
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0">
          <title>JupyterLab Header</title>
          <style>
            body {
              background: ${LightThemeBGColor};
              color: #000000;
              margin: 0;
              overflow: hidden;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica,
                Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji',
                'Segoe UI Symbol';
              font-size: 13px;
              -webkit-user-select: none;
              user-select: none;
            }
            body.app-ui-dark {
              background: ${DarkThemeBGColor};
              color: #ffffff;
            }
            .container {
              padding: 80px 120px;
              font-size: 16px;
            }
            .row {
              display: flex;
              flex-direction: row;
            }
            .col {
              display: flex;
              flex-direction: column;
            }
            .logo svg {
              width: 80px;
              height: 80px;
            }
            .title-row {
              align-items: center;
              column-gap: 10px;
              margin-bottom: 80px;
            }
            .app-title {
              font-size: 30px;
            }
            .start-recent-col {
              flex-basis: 40%;
              flex-grow: 1;
              row-gap: 40px;
            }
            .start-col {
              row-gap: 5px;
            }
            .recent-col {
              row-gap: 5px;
            }
            .news-col {
              flex-basis: 60%;
              flex-grow: 1;
              row-gap: 5px;
            }
            .news-list-col {
              display: flex;
              flex-direction: column;
              row-gap: 5px;
            }
            .news-col-footer {
              margin-top: 5px;
            }
            .row-title {
              font-weight: bold;
              margin-bottom: 5px;
            }
            a {
              color: #555555;
              text-decoration: none;
            }
            a:hover {
              color: #777777;
            }
            .app-ui-dark a {
              color: #cccccc;
            }
            .app-ui-dark a:hover {
              color: #eeeeee;
            }
            .more-row a {
              color: #202020;
            }
            .app-ui-dark .more-row a {
              color: #f0f0f0;
            }
            .jupyterlab-wordmark svg {
              width: 300px;
            }
            .jupyterlab-wordmark .jp-icon2 {
              fill: #888888;
            }
          </style>
          <script>
            document.addEventListener("DOMContentLoaded", async () => {
              const appConfig = window.electronAPI.getAppConfig();
              const platform = appConfig.platform;
              document.body.dataset.appPlatform = platform;
              document.body.classList.add('app-ui-' + platform);
              if (await window.electronAPI.isDarkTheme()) {
                document.body.classList.add('app-ui-dark');
              }
            });
          </script>
        </head>
      
        <body>
          <div class="body-container">
          <div class="container">
            <div class="row title-row">
              <div class="app-title">
                <div class="jupyterlab-wordmark">
                  ${jupyterlabWordmarkSrc}
                </div>
              </div>
            </div>

            <div class="row content-row">
              <div class="col start-recent-col">
                <div class="col start-col">
                  <div class="row row-title">
                    Start
                  </div>
                  <div class="row">
                    <a href="javascript:void(0)" title="Create new notebook in the default working directory" onclick="handleNewSessionClick('notebook');">New notebook...</a>
                  </div>
                  <div class="row">
                    <a href="javascript:void(0)" title="Launch new JupyterLab session in the default working directory" onclick="handleNewSessionClick('blank');">New session...</a>
                  </div>
                  ${
                    process.platform === 'darwin'
                      ? `<div class="row">
                      <a href="javascript:void(0)" title="Open a notebook or folder in JupyterLab" onclick="handleNewSessionClick('open');">Open...</a>
                    </div>`
                      : `<div class="row">
                      <a href="javascript:void(0)" title="Open a notebook or file in JupyterLab" onclick="handleNewSessionClick('open-file');">Open File...</a>
                    </div>
                    <div class="row">
                      <a href="javascript:void(0)" title="Open a folder in JupyterLab" onclick="handleNewSessionClick('open-folder');">Open Folder...</a>
                    </div>`
                  }
                  <div class="row">
                    <a href="javascript:void(0)" title="Connect to a remote JupyterLab server" onclick="handleNewSessionClick('remote');">New remote session...</a>
                  </div>
                </div>
                
                <div class="col recent-col">
                  <div class="row row-title">
                    Recent
                  </div>
                  <div class="row">
                    <a href="javascript:void(0)" onclick='handleRecentClick(this);'>../test</a>
                  </div>
                  <div class="row">
                    <a href="javascript:void(0)" onclick='handleRecentClick(this);'>./another.ipynb </a>
                  </div>
                </div>
              </div>

              <div class="col news-col">
                <div class="row row-title">
                  Jupyter News
                </div>

                <div id="news-list" class="news-list-col">
                ${
                  // populate news list from cache
                  WelcomeView._newsList
                    .map((news: INewsItem) => {
                      return `<div class="row">
                        <a href="javascript:void(0)" onclick=\'handleNewsClick("${news.link}");\'>${news.title}</a>
                      </div>`;
                    })
                    .join('')
                }
                </div>

                <div class="row more-row news-col-footer">
                  <a href="javascript:void(0)" onclick='handleNewsClick("https://blog.jupyter.org");'>Jupyter Blog</a>
                </div>
              </div>
            </div>
          </div>
          </div>

          <script>
          const newsListContainer = document.getElementById('news-list');
          
          window.electronAPI.onSetNewsList((newsList) => {
            // clear list
            while (newsListContainer.firstChild) {
              newsListContainer.firstChild.remove();
            }

            const fragment = new DocumentFragment();
            for (const news of newsList) {
              const newsRow = document.createElement('div');
              newsRow.innerHTML = \`
                <div class="row">
                  <a href="javascript:void(0)" onclick=\'handleNewsClick("\$\{news.link\}");\'>\$\{news.title\}</a>
                </div>\`;
              fragment.append(newsRow);
            }

            newsListContainer.append(fragment);
          });

          function handleNewSessionClick(type) {
            window.electronAPI.newSession(type);
          }

          function handleNewsClick(newsLink) {
            window.electronAPI.openNewsLink(newsLink);
          }
          </script>
        </body>
      </html>
      `;

    this._registerListeners();
  }

  get view(): BrowserView {
    return this._view;
  }

  load() {
    this._view.webContents.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(this._pageSource)}`
    );
    this._updateNewsList();
  }

  private _registerListeners() {
    ipcMain.on('open-news-link', (event, link) => {
      if (event.sender !== this._view.webContents) {
        return;
      }

      try {
        const url = new URL(decodeURIComponent(link));
        if (url.protocol === 'https:' || url.protocol === 'http:') {
          shell.openExternal(url.href);
        }
      } catch (error) {
        console.error('Invalid news URL');
      }
    });
  }

  private _updateNewsList() {
    const newsFeedUrl = 'https://blog.jupyter.org/feed';
    const maxNewsToShow = 10;

    fetch(newsFeedUrl)
      .then(async response => {
        try {
          const data = await response.text();
          const parser = new XMLParser();
          const feed = parser.parse(data);
          const newsList: INewsItem[] = [];
          for (const item of feed.rss.channel.item) {
            newsList.push({
              title: item.title,
              link: encodeURIComponent(item.link)
            });
            if (newsList.length === maxNewsToShow) {
              break;
            }
          }

          this._view.webContents.send('set-news-list', newsList);

          WelcomeView._newsList = newsList;
        } catch (error) {
          console.error('Failed to parse news list:', error);
        }
      })
      .catch(error => {
        console.error('Failed to fetch news list:', error);
      });
  }

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  private _parent: MainWindow;
  private _view: BrowserView;
  private _pageSource: string;
  static _newsList: INewsItem[] = [];
}
