import { saveAs } from "file-saver";
import { ErrorMessage, Field, Form, Formik } from "formik";
import { Inter } from "next/font/google";
import { useState } from "react";

import JSZip from "jszip";

const inter = Inter({ subsets: ["latin"] });
const wikipediaUrlPattern = new RegExp(
  "^https:\\/\\/(?:[a-z]+\\.)*wikipedia\\.org\\/wiki\\/[A-zÀ-ÿ\\w\\-\\(\\)\\-\\_]+$"
);
const wikipediaApiUrl = new URL("https://en.wikipedia.org/w/api.php");

async function getWikipediaHtml(articleTitle: string): Promise<string> {
  wikipediaApiUrl.search = new URLSearchParams({
    action: "parse",
    format: "json",
    prop: "text",
    page: decodeURIComponent(articleTitle),
    origin: "*",
  }).toString();

  const response = await fetch(wikipediaApiUrl);
  if (!response.ok) {
    throw new Error(
      `HTTP error! Status: ${response.status} for ${wikipediaApiUrl} with ${articleTitle}`
    );
  }

  const data = await response.json();
  const page = data.parse;

  if (!page || !page.text || !page.text["*"]) {
    throw new Error(
      `Payload error! Status: ${response.status} for ${wikipediaApiUrl} with ${articleTitle}`
    );
  }

  const textContents = page.text["*"];

  return textContents;
}

async function cleanHtml(document: Document): Promise<Document> {
  // remove all images
  document.querySelectorAll("img, video, style").forEach((el) => el.remove());

  // remove all comments and multiline comments
  document.querySelectorAll("body").forEach((el) => {
    el.innerHTML = el.innerHTML.replace(/<!--[\s\S]*?-->/g, "");
  });

  // compress the whitespace in the html
  document.querySelectorAll("body").forEach((el) => {
    el.innerHTML = el.innerHTML.replace(/\s+/g, " ");
  });

  // remove all css classes
  document.querySelectorAll("*").forEach((el) => {
    el.removeAttribute("class");
  });

  return document;
}

async function isValidWikipediaUrl(urlString: string): Promise<boolean> {
  return !!wikipediaUrlPattern.test(urlString);
}

export default function Home() {
  const [tracker, setTracker] = useState<[number, number]>([0, 0]);

  async function runPipeline(url: URL): Promise<void> {
    var zip = new JSZip();
    const parser = new DOMParser();

    const title = url.pathname.split("/").pop();
    if (!title) throw new Error("missing title");

    const pageHtml = await getWikipediaHtml(title);

    // parse the html
    const doc = parser.parseFromString(pageHtml, "text/html");

    await cleanHtml(doc);

    // remove all links except the ones for /wiki/ pages and no special categories
    doc.querySelectorAll("a").forEach((el) => {
      const href = el.getAttribute("href");
      if (href && !href.includes("/wiki/")) {
        el.removeAttribute("href");
      } else if (href && href.includes("/wiki/")) {
        const parts = href.split(":");
        if (parts.length > 1) {
          el.removeAttribute("href");
        }
      }
    });

    const links = doc.links;

    for (let i = 0; i < links.length; i++) {
      setTracker([i + 1, links.length + 1]);
      const link = links[i];
      const href = link.getAttribute("href");
      if (!href) continue;
      const url = new URL(href, "https://en.wikipedia.org");
      const title = url.pathname.split("/").pop();
      if (!title) throw new Error("missing title");

      const pageHtml = await getWikipediaHtml(title);

      // parse the html
      const parser = new DOMParser();
      let doc = parser.parseFromString(pageHtml, "text/html");

      // if is less than 20kb, check if it contains "Redirect to:" then extract "/wiki/*" and download that
      if (doc.documentElement.innerHTML.length < 20000) {
        const redirect = doc
          .querySelector("a")
          ?.getAttribute("href")
          ?.split("/wiki/")
          .pop();
        if (redirect) {
          const pageHtml = await getWikipediaHtml(redirect);
          doc = parser.parseFromString(pageHtml, "text/html");
        }
      }

      await cleanHtml(doc);

      // remove all targets from all links
      doc.querySelectorAll("a").forEach((el) => {
        el.removeAttribute("href");
      });

      const blob = new Blob([doc.documentElement.innerHTML], {
        type: "text/html",
      });

      zip.folder("wiki")?.file(`${title}.html`, blob);
    }

    // add a "./" prefix to all links that contain /wiki/
    doc.querySelectorAll("a").forEach((el) => {
      const href = el.getAttribute("href");
      if (href && href.includes("/wiki/")) {
        el.setAttribute("href", `./${href}.html`);
      }
    });

    const blob = new Blob([doc.documentElement.innerHTML], {
      type: "text/html",
    });

    zip.file(`${title}.html`, blob);

    const content = await zip.generateAsync({ type: "blob" });

    saveAs(content, `${title}.zip`);
    setTracker([0, 0]);
  }

  async function isValidWikipediaUrl(urlString: string): Promise<boolean> {
    return !!wikipediaUrlPattern.test(urlString);
  }

  return (
    <main
      className={`flex w-full flex-col items-center space-y-4 p-32 ${inter.className}`}
    >
      <h1>read the whole article offline</h1>
      <Formik
        initialValues={{ wikiUrl: "" }}
        onSubmit={async (values, { setSubmitting }) => {
          if (await isValidWikipediaUrl(values.wikiUrl)) {
            const url = new URL(values.wikiUrl);
            await runPipeline(url);
          } else {
            alert("invalid wikipedia url");
          }
          setSubmitting(false);
        }}
      >
        {({ isSubmitting, handleSubmit }) => (
          <Form
            className={"w-fit space-x-2"}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSubmit();
              }
            }}
          >
            {!isSubmitting ? (
              <>
                <label htmlFor="wikiUrl">wikipedia url</label>
                <Field
                  className={"border border-slate-500 p-1 "}
                  type="text"
                  name="wikiUrl"
                  validate={(value: any) => {
                    if (!value) {
                      return "missing wikipedia url";
                    }
                    if (!wikipediaUrlPattern.test(value)) {
                      return "invalid wikipedia url";
                    }
                  }}
                />
                <button
                  className={
                    "rounded-md p-1 shadow-md shadow-slate-500 transition-shadow"
                  }
                  type="submit"
                  disabled={isSubmitting}
                >
                  download
                </button>
              </>
            ) : (
              <div role="status">
                <svg
                  aria-hidden="true"
                  className="mr-2 inline h-8 w-8 animate-spin fill-yellow-400 text-gray-200 dark:text-gray-600"
                  viewBox="0 0 100 101"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
                    fill="currentColor"
                  />
                  <path
                    d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
                    fill="currentFill"
                  />
                </svg>
                {tracker[0]} / {tracker[1]}
              </div>
            )}
            <ErrorMessage name="wikiUrl" component="div" />
          </Form>
        )}
      </Formik>
      <p>
        simply enter a wikipedia url and we will download its contents and links
        so you can read the full thing offline
      </p>
      <p>
        build by{" "}
        <a target="_blank" href="https://twitter.com/psiesta11">
          psiesta11
        </a>
      </p>
      <a
        className={"animate-bounce"}
        href="thanks"
        onClick={(e) => {
          e.preventDefault();
          alert("thanks but not yet");
        }}
      >
        buy me un cafe
      </a>
    </main>
  );
}
