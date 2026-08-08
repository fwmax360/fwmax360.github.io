<?xml version="1.0" encoding="utf-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">

  <!--
    浏览器直接打开 rss.xml 时用这份样式渲染成可读页面。
    订阅器会忽略 xml-stylesheet，只吃原始 XML。
    明暗两套配色都写死对比度，避免「白底浅字」看不见。
  -->

  <xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes"/>

  <xsl:template match="/">
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <meta name="color-scheme" content="dark light"/>
        <title><xsl:value-of select="/rss/channel/title"/> — RSS</title>
        <style>
          :root {
            color-scheme: dark light;
            --bg: #0a0c10;
            --surface: #12161d;
            --line: #2b3441;
            --text: #e8edf4;
            --dim: #9aa6b5;
            --faint: #6b7787;
            --accent: #3ddc84;
            --warn: #e6b35a;
            --link: #7dd3fc;
          }

          @media (prefers-color-scheme: light) {
            :root {
              --bg: #f4f6f8;
              --surface: #ffffff;
              --line: #d5dbe3;
              --text: #15202b;
              --dim: #4a5868;
              --faint: #6b7a8a;
              --accent: #0d8f4e;
              --warn: #9a6700;
              --link: #0369a1;
            }
          }

          * { box-sizing: border-box; }

          body {
            margin: 0;
            min-height: 100vh;
            background: var(--bg);
            color: var(--text);
            font: 16px/1.7 system-ui, -apple-system, "PingFang SC", "Hiragino Sans GB",
              "Microsoft YaHei", "Noto Sans SC", sans-serif;
            -webkit-font-smoothing: antialiased;
          }

          .wrap {
            max-width: 46rem;
            margin: 0 auto;
            padding: 2.5rem 1.25rem 4rem;
          }

          .mono {
            font-family: ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace;
          }

          .banner {
            padding: 0.85rem 1rem;
            margin-bottom: 1.75rem;
            border: 1px solid var(--line);
            border-left: 3px solid var(--accent);
            border-radius: 0.5rem;
            background: var(--surface);
            color: var(--dim);
            font-size: 0.88rem;
          }

          .banner strong {
            color: var(--text);
            font-weight: 650;
          }

          .banner a {
            color: var(--link);
          }

          header h1 {
            margin: 0 0 0.5rem;
            font-size: 1.55rem;
            line-height: 1.3;
            color: var(--text);
            font-weight: 700;
          }

          header h1 .sigil {
            color: var(--accent);
            font-family: ui-monospace, Menlo, monospace;
            margin-right: 0.35rem;
          }

          .desc {
            margin: 0 0 0.9rem;
            color: var(--dim);
            font-size: 0.95rem;
          }

          .meta {
            display: flex;
            flex-wrap: wrap;
            gap: 0.75rem 1.1rem;
            font-size: 0.78rem;
            color: var(--faint);
            margin-bottom: 2.25rem;
            padding-bottom: 1.25rem;
            border-bottom: 1px solid var(--line);
          }

          .meta a {
            color: var(--link);
            text-decoration: none;
          }

          .meta a:hover {
            text-decoration: underline;
          }

          .kicker {
            margin: 0 0 0.9rem;
            font-size: 0.72rem;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: var(--faint);
          }

          article {
            padding: 1.15rem 0;
            border-bottom: 1px solid var(--line);
          }

          article.egg {
            border: 1px solid var(--line);
            border-left: 3px solid var(--warn);
            border-radius: 0.5rem;
            padding: 1rem 1.1rem;
            margin-top: 1.5rem;
            background: var(--surface);
          }

          article h2 {
            margin: 0 0 0.4rem;
            font-size: 1.05rem;
            font-weight: 650;
            line-height: 1.45;
          }

          article h2 a {
            color: var(--text);
            text-decoration: none;
          }

          article h2 a:hover {
            color: var(--accent);
          }

          article.egg h2 a {
            color: var(--warn);
          }

          .item-desc {
            margin: 0 0 0.55rem;
            color: var(--dim);
            font-size: 0.92rem;
          }

          .item-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem 0.85rem;
            font-size: 0.75rem;
            color: var(--faint);
          }

          .tag {
            padding: 0.05rem 0.4rem;
            border: 1px solid var(--line);
            border-radius: 3px;
            color: var(--dim);
            background: var(--surface);
          }

          footer {
            margin-top: 2.5rem;
            font-size: 0.78rem;
            color: var(--faint);
          }

          footer a {
            color: var(--link);
          }
        </style>
      </head>
      <body>
        <div class="wrap">
          <p class="banner">
            <strong>这是 RSS 订阅源的可读视图。</strong>
            订阅请直接用 feed 地址
            <a class="mono" href="/rss.xml">/rss.xml</a>
            ；下面按系统明暗主题着色，避免白底浅字。
          </p>

          <header>
            <h1>
              <span class="sigil" aria-hidden="true">$</span>
              <xsl:value-of select="/rss/channel/title"/>
            </h1>
            <p class="desc"><xsl:value-of select="/rss/channel/description"/></p>
            <div class="meta mono">
              <span><xsl:value-of select="/rss/channel/generator"/></span>
              <span><xsl:value-of select="/rss/channel/copyright"/></span>
              <a href="/">← 回博客</a>
              <a href="/about/">about</a>
            </div>
          </header>

          <p class="kicker mono">// items</p>

          <xsl:for-each select="/rss/channel/item">
            <article>
              <xsl:if test="category = 'easter-egg'">
                <xsl:attribute name="class">egg</xsl:attribute>
              </xsl:if>
              <h2>
                <a>
                  <xsl:attribute name="href"><xsl:value-of select="link"/></xsl:attribute>
                  <xsl:value-of select="title"/>
                </a>
              </h2>
              <p class="item-desc"><xsl:value-of select="description"/></p>
              <div class="item-meta mono">
                <time><xsl:value-of select="pubDate"/></time>
                <xsl:for-each select="category">
                  <span class="tag"><xsl:value-of select="."/></span>
                </xsl:for-each>
              </div>
            </article>
          </xsl:for-each>

          <footer class="mono">
            <xsl:value-of select="/rss/channel/managingEditor"/>
            ·
            <a href="/rss.xml">view source xml</a>
          </footer>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
