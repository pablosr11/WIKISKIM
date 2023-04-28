import { saveAs } from "file-saver";
import { ErrorMessage, Field, Form, Formik } from "formik";
import { Inter } from "next/font/google";
import { useState } from "react";
import { v4 as uuid } from "uuid";

import JSZip from "jszip";

const inter = Inter({ subsets: ["latin"] });
const wikipediaUrlPattern = new RegExp(
  "^https:\\/\\/(?:[a-z]+\\.)*wikipedia\\.org\\/wiki\\/[A-zÀ-ÿ\\w\\-\\(\\)\\-\\_]+$"
);
const wikipediaApiUrl = new URL("https://en.wikipedia.org/w/api.php");

// function returns an object with title, url, and html
async function getWikipediaHtml(articleUrl: URL): Promise<{
  title: string;
  textContents: string;
  articleUrl: URL;
  doc: Document;
  links: URL[];
}> {
  const title = articleUrl.pathname.split("/").pop();
  if (!title) throw new Error("missing title");

  wikipediaApiUrl.search = new URLSearchParams({
    action: "parse",
    format: "json",
    prop: "text",
    page: decodeURIComponent(title),
    origin: "*",
  }).toString();

  const response = await fetch(wikipediaApiUrl);
  if (!response.ok) {
    throw new Error(
      `HTTP error! Status: ${response.status} for ${wikipediaApiUrl} with ${title}`
    );
  }

  const data = await response.json();
  const page = data.parse;
  let textContents = "";

  if (!page || !page.text || !page.text["*"]) {
    console.log(
      `Payload error! Status: ${response.status} for ${wikipediaApiUrl} with ${title}`
    );
    textContents = "";
  } else {
    textContents = page.text["*"];
  }

  // parse the html string into a document
  const doc = new DOMParser().parseFromString(textContents, "text/html");

  await cleanHtml(doc);

  // @ts-ignore TS2802
  const links = [...doc.links]
    .filter((link: Element) => {
      const href = link.getAttribute("href");
      if (!href) return false;
      return true;
    })
    .map((link: Element) => {
      return new URL(link.getAttribute("href")!, "https://en.wikipedia.org");
    });

  return { title, textContents, articleUrl, doc, links };
}

async function cleanHtml(document: Document): Promise<Document> {
  // remove all images
  document
    .querySelectorAll("img, video, style, table")
    .forEach((el) => el.remove());

  // remove all comments and multiline comments
  document.querySelectorAll("body").forEach((el) => {
    el.innerHTML = el.innerHTML.replace(/<!--[\s\S]*?-->/g, "");
  });

  // find elements like this <span>[</span> and remove its parent span element
  document.querySelectorAll("span").forEach((el) => {
    if (el.innerHTML === "[") {
      el.parentElement?.remove();
    }
  });

  // remove all css classes
  document.querySelectorAll("*").forEach((el) => {
    el.removeAttribute("class");
  });

  // remove everything after the External_links section (included)
  const externalLinks = document.querySelector("#External_links");
  if (externalLinks && externalLinks.parentElement) {
    let el = externalLinks.parentElement.nextElementSibling;
    while (el) {
      const nextEl = el.nextElementSibling;
      el.remove();
      el = nextEl;
    }
    externalLinks.remove();
  }

  // remove all links except the ones for /wiki/ pages and no special categories
  document.querySelectorAll("a").forEach((el) => {
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

  // remove elements and child elements that specify a style width or display
  document.querySelectorAll("*").forEach((el) => {
    if (el.getAttribute("style")?.includes("width")) {
      el.remove();
    } else if (el.getAttribute("style")?.includes("display")) {
      el.remove();
    }
  });

  // remove ell div with role="note"
  document.querySelectorAll('div[role="note"]').forEach((el) => {
    el.remove();
  });

  // remove all link elements
  document.querySelectorAll("link").forEach((el) => {
    el.remove();
  });

  // remove ids from sup elements
  document.querySelectorAll("sup").forEach((el) => {
    el.removeAttribute("id");
  });

  // remove all title attributes
  document.querySelectorAll("*").forEach((el) => {
    el.removeAttribute("title");
  });

  // minimize the html
  document.querySelectorAll("body").forEach((el) => {
    el.innerHTML = el.innerHTML.replace(/\s+/g, " ");
  });

  // remove elements with no attributes and empty
  document.querySelectorAll("*").forEach((el) => {
    if (el.attributes.length === 0 && el.innerHTML === "") {
      el.remove();
    }
  });

  return document;
}

async function isValidWikipediaUrl(urlString: string): Promise<boolean> {
  return !!wikipediaUrlPattern.test(urlString);
}

export default function Home() {
  const [tracker, setTracker] = useState<[number, number]>([0, 0]);

  async function runPipeline(url: URL): Promise<void> {
    // var zip = new JSZip();
    const serializer = new XMLSerializer();

    // childPages will be an array of objects with the title and html
    const childPages: { title: string; content: string }[] = [];

    const { title, doc, links } = await getWikipediaHtml(url);

    for (let i = 0; i < links.length; i++) {
      setTracker([i + 1, links.length + 1]);
      const url = links[i];
      const { title, doc } = await getWikipediaHtml(url);

      // if is less than 20kb, check if it contains "Redirect to:" then extract "/wiki/*" and download that
      if (doc.documentElement.innerHTML.length < 20000) {
        const redirect = doc
          .querySelector("a")
          ?.getAttribute("href")
          ?.split("/wiki/")
          .pop();

        if (redirect) {
          const url = new URL(redirect, "https://en.wikipedia.org");
          const { doc } = await getWikipediaHtml(url);

          // remove all targets from all links
          doc.querySelectorAll("a").forEach((el) => {
            el.removeAttribute("href");
          });

          childPages.push({
            title,
            content: serializer.serializeToString(doc.documentElement),
          });
          continue;
        }
      }

      // remove all targets from all links
      doc.querySelectorAll("a").forEach((el) => {
        el.removeAttribute("href");
      });

      childPages.push({
        title,
        content: serializer.serializeToString(doc.documentElement),
      });

      // const blob = new Blob([doc.documentElement.innerHTML], {
      //   type: "text/html",
      // });
      // zip.folder("wiki")?.file(`${title}.html`, blob);
    }

    setTracker([0, 0]);

    // // // EPUB GENERATION
    // replace every anchor in doc to point to the section with id "Nucleic_acid"
    doc.querySelectorAll("a").forEach((el) => {
      const href = el.getAttribute("href");
      if (!href) return;
      const url = new URL(href, "https://en.wikipedia.org");
      let title = url.pathname.split("/").pop();
      if (!title) throw new Error("missing title");
      title = title.replace(".html", "");
      el.setAttribute("href", `#${title}`);
    });

    const xmlString = serializer.serializeToString(doc.documentElement);
    const epubZip = new JSZip();
    const bookUUID = uuid().toUpperCase();
    const mimetype = "application/epub+zip";
    epubZip.file("mimetype", mimetype);
    const container =
      '<?xml version="1.0"?>' +
      '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
      "  <rootfiles>" +
      '    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />' +
      "  </rootfiles>" +
      "</container>";
    epubZip.file("META-INF/container.xml", container);
    const metadata =
      '<?xml version="1.0"?>' +
      '<package version="3.0" xml:lang="en" xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id">' +
      '  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
      `    <dc:identifier id="book-id">urn:uuid:${bookUUID.toString()}</dc:identifier>` +
      '    <meta refines="#book-id" property="identifier-type" scheme="xsd:string">uuid</meta>' +
      '    <meta property="dcterms:modified">2000-03-24T00:00:00Z</meta>' +
      "    <dc:language>en</dc:language>" +
      `    <dc:title>${title}</dc:title>` +
      "    <dc:creator>WikiSkim</dc:creator>" +
      "  </metadata>" +
      "  <manifest>" +
      '    <item id="text" href="text.xhtml" media-type="application/xhtml+xml"/>' +
      '    <item id="toc" href="../OEBPS/toc.ncx" media-type="application/x-dtbncx+xml"/>' +
      "  </manifest>" +
      '  <spine toc="toc">' +
      '    <itemref idref="text"/>' +
      "  </spine>" +
      "</package>";
    epubZip.file("OEBPS/content.opf", metadata);
    const toc =
      '<?xml version="1.0"?>' +
      '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">' +
      "  <head>" +
      `    <meta name="dtb:uid" content="urn:uuid:${bookUUID.toString()}"/>` +
      `    <meta name="dtb:depth" content="${links.length}"/>` +
      `    <meta name="dtb:totalPageCount" content="${links.length}"/>` +
      `    <meta name="dtb:maxPageNumber" content="${links.length}"/>` +
      "  </head>" +
      "  <docTitle>" +
      `    <text>Table of contents for ${title}</text>` +
      "  </docTitle>" +
      "  <navMap>" +
      '    <navPoint id="navpoint-1" playOrder="1">' +
      "      <navLabel>" +
      `        <text>${title}</text>` +
      "      </navLabel>" +
      "      <content src=\"text.xhtml#xpointer(id('Nucleic_acid'))\"/>" +
      "    </navPoint>" +
      childPages.map((page, index) => {
        return (
          '    <navPoint id="navpoint-' +
          (index + 2) +
          '" playOrder="' +
          (index + 2) +
          '">' +
          "      <navLabel>" +
          "        <text>" +
          page.title +
          "</text>" +
          "      </navLabel>" +
          `      <content src="#${page.title}"/>` +
          "    </navPoint>"
        );
      }) +
      "  </navMap>" +
      "</ncx>";
    epubZip.file("OEBPS/toc.ncx", toc);
    var text =
      '<?xml version="1.0" encoding="UTF-8" standalone="no"?>' +
      "<!DOCTYPE html>" +
      '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">' +
      "  <head>" +
      `    <title>${title}</title>` +
      "  </head>" +
      "  <body>" +
      `    <section id="${title}"><h1>${title}</h1>${xmlString}</section>` +
      childPages.map((page) => {
        return `<section id="${page.title}"><h1>Chapter ${page.title}</h1>${page.content}</section>`;
      }) +
      "  </body>" +
      "</html>";
    epubZip.file("OEBPS/text.xhtml", text);

    // Generate a downloadable EPUB file from the ZIP file
    epubZip.generateAsync({ type: "blob" }).then(function (blob) {
      saveAs(blob, `${title}.epub`);
    });
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
