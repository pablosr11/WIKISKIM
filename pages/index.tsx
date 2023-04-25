import { ErrorMessage, Field, Form, Formik } from "formik";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });
const wikipediaUrlPattern = new RegExp(
  "^https:\\/\\/(?:[a-z]+\\.)?wikipedia\\.org\\/wiki\\/[\\w\\-]+$"
);

export default function Home() {
  async function dostuff(data: { wikiUrl: string }) {
    console.log(data.wikiUrl);
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
            await dostuff(values);
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
      <a className={"animate-bounce"} href="#">
        buy me un cafe
      </a>
    </main>
  );
}
