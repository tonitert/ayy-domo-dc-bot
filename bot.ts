import { Client } from "discord.js";
import * as cheerio from "cheerio"
import axios, {AxiosResponse} from "axios";
import fetch, {Response} from "node-fetch"

const client: Client = new Client ({intents: []})

class Time {
    hours: number
    minutes: number

    constructor(hours: number, minutes: number) {
        this.hours = hours
        this.minutes = minutes
    }
}

let userAgent;
const domoUsername = process.env.domoUsername
const domoPassword = process.env.domoPassword
let timeString = process.env.time.split(".")
const checkTime = new Time(Number(timeString[0]),Number(timeString[1]))

client.login(process.env.TOKEN).then(() => {
    console.log(`Logged in as ${client.user.tag}`)
    let promise = mainLoop()
})

async function mainLoop () {
    userAgent = (await axios.get("https://jnrbsn.github.io/user-agents/user-agents.json")).data[0];
    while(true) {
        await check()
        let date = new Date()
        if(Date.now() > date.setHours(checkTime.hours, checkTime.minutes)){
            date = new Date(date.getTime() + 24 * 60 * 60 * 1000)
        }
        await sleep(date.getTime() - Date.now())
    }
}

async function login (): Promise<string> {
    let login_page = await fetch("https://domo.ayy.fi/customers/sign_in", {
        headers: {
            "User-Agent": userAgent
        }
    })
    const $ = cheerio.load(await login_page.text())
    let authenticity_token: string = <string>$("#new_customer > input[name=\"authenticity_token\"]").val();
    let session = getSession(login_page);
    const params: URLSearchParams = new URLSearchParams();
    params.append("utf8", "✓");
    params.append("authenticity_token", authenticity_token);
    params.append("customer[email]", domoUsername);
    params.append("customer[password]", domoPassword);
    params.append("commit", "Kirjaudu+sisään");
    await sleep(400)
    let res = await fetch({
        method: "post",
        url: "https://domo.ayy.fi/customers/sign_in",
        headers: {
            // @ts-ignore
            Cookie: `_campus_session=${session}`,
            "User-Agent": userAgent,
            "Content-Type": "application/application/x-www-form-urlencoded",
            Referer: "https://domo.ayy.fi/customers/sign_in",
        }
    })
    if(res.status != 302) {
        throw "Wrong password";
    }
    return getSession(res)
}

function getSession(response: Response): string {
    // Set-Cookie does not return an array, so we have to use ts-ignore
    // @ts-ignore
    return response.headers["set-cookie"].match("(?<=^_campus_session=)([\\w%-]*)")[0]
}

async function check () {
    await login()
}

function sleep (ms: number) {
    return new Promise((res,rej) => {
        setTimeout(() => {
            res(null)
        }, ms)
    })
}