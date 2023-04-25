import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta
          name="description"
          content="The largest offline encyclopedia"
          key="desc"
        />
        <meta property="og:title" content="Wikiskim" />
        <meta
          property="og:description"
          content="For a focused reading experience"
        />
        <meta
          property="og:image"
          content="https://example.com/images/cool-page.jpg"
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
