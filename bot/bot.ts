import { Client, EmbedBuilder, TextChannel } from 'discord.js'
import * as cheerio from 'cheerio'
import axios, { AxiosResponse } from 'axios'
import * as dotenv from 'dotenv'
import { Apartment, Ranking } from './types.js'
import * as fs from 'fs'
import Logger from './logger.js'

dotenv.config()

const logger = new Logger()
const client: Client = new Client({ intents: [] })

const axiosInstance = axios.create({
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': 'Windows',
    'Upgrade-Insecure-Requests': '1',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-User': '?1',
    'Sec-Fetch-Dest': 'document',
    'Accept-Encoding': 'gzip, deflate',
    'Accept-Language': 'fi-FI,fi;q=0.9,en-US;q=0.8,en;q=0.7'
  },
  maxRedirects: 0,
  validateStatus: (status) => status < 400
})

const ApartmentType: {
  [key: string]: string
} = {
  nelio: 'neliö',
  kolmio: 'kolmio',
  kaksio: 'kaksio',
  yksio: 'yksiö'
}

class Time {
  hours: number
  minutes: number

  constructor (hours: number, minutes: number) {
    this.hours = hours
    this.minutes = minutes
  }
}

if (process.env.DOMO_USERNAME === undefined ||
  process.env.DOMO_PASSWORD === undefined ||
  process.env.TIME === undefined ||
  process.env.CHANNEL_ID === undefined ||
  process.env.APPLICATION_IDS === undefined) throw new Error('Some environment variables not defined')

const domoUsername = process.env.DOMO_USERNAME
const domoPassword = process.env.DOMO_PASSWORD
const timeString = process.env.TIME.split('.')
const checkTime = new Time(Number(timeString[0]), Number(timeString[1]))
const applicationIds = process.env.APPLICATION_IDS.split(',')

let oldRanking: {
  [key: string]: Ranking
} = {}

void Promise.all([
  client.login(process.env.DISCORD_TOKEN),
  new Promise<void>((resolve) => {
    fs.promises.mkdir('./data/ranking/', { recursive: true })
      .then(async () => await fs.promises.readdir('./data/ranking'))
      .then(async (filenames) => (await Promise.all(filenames.map(
        async (filename) =>
          filename.endsWith('.json')
            ? {
                filename,
                content: await fs.promises.readFile(`./file/ranking/${filename}`)
              }
            : null))).filter(v => v !== null))
      .then((files) => {
        // can't be null
        // @ts-expect-error
        // eslint-disable-next-line no-return-assign
        files.forEach(f => oldRanking[f.filename] = JSON.parse(f.content.toString()))
        resolve()
      })
      .catch((r) => {
        if (r.code !== 'ENOENT') throw r
        oldRanking = {}
        resolve()
      })
  })
]).then(() => {
  // @ts-expect-error
  logger.log(`Logged in as ${client.user.tag}`)
  void mainLoop()
})

async function mainLoop (): Promise<void> {
  while (true) {
    axiosInstance.defaults.headers['User-Agent'] = (await axiosInstance.get('https://jnrbsn.github.io/user-agents/user-agents.json')).data[0]
    try {
      logger.log('Logging in.. ')
      const cookie: string = await login()
      for (const applicationId of applicationIds) {
        logger.log(`Running check for application ${applicationId}`)
        await check(applicationId, cookie)
      }
      logger.log('All applications checked.')
    } catch (e) {
      logger.error('Exception occurred during checking: ')
      logger.error(e)
      logger.error(e.stack)
    }
    let date = new Date()
    if (Date.now() > date.setHours(checkTime.hours, checkTime.minutes)) {
      date = new Date(date.getTime() + 24 * 60 * 60 * 1000)
    }
    while (true) {
      const time = date.getTime() - Date.now()
      const checkInterval = 1000 * 60 * 2
      if (time < checkInterval) {
        await sleep(time)
        break
      }
      await sleep(checkInterval)
    }
  }
}

async function login (): Promise<string> {
  delete axiosInstance.defaults.headers.Cookie
  const loginPage = await axiosInstance.get('https://domo.ayy.fi/customers/sign_in')
  const $ = cheerio.load(loginPage.data)
  const authenticityToken: string = $('#new_customer > input[name="authenticity_token"]').val() as string
  axiosInstance.defaults.headers.Cookie = getSession(loginPage)
  const params: URLSearchParams = new URLSearchParams()
  params.append('authenticity_token', authenticityToken)
  params.append('customer[email]', domoUsername)
  params.append('customer[password]', domoPassword)
  params.append('commit', 'Kirjaudu+sisään')
  await sleep(400)
  const res = await axiosInstance.post('https://domo.ayy.fi/customers/sign_in', params)
  if (res.status !== 302) {
    throw new Error('Wrong password')
  }
  return getSession(res)
}

function getSession (response: AxiosResponse): string {
  // Set-Cookie does not return an array, so we have to use ts-ignore
  // @ts-expect-error
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  return `_campus_session=${response.headers['set-cookie'].match('(?<=^_campus_session=)([\\w%-]*)')[0]}`
}

async function check (applicationId: string, cookie: string): Promise<void> {
  axiosInstance.defaults.headers.Cookie = cookie
  await sleep(400)
  const applicationPage = await axiosInstance.get(`https://domo.ayy.fi/applications/${applicationId}`)
  axiosInstance.defaults.headers.Cookie = getSession(applicationPage)
  const $ = cheerio.load(applicationPage.data)
  const csrfToken = $('head > meta[name="csrf-token"]').attr('content')
  if (csrfToken === undefined) throw new Error('Page format changed')

  axiosInstance.defaults.headers['Content-Type'] = 'application/json'
  axiosInstance.defaults.headers.Accept = 'application/json'
  axiosInstance.defaults.headers['X-CSRF-Token'] = csrfToken

  await sleep(400)
  const application = await axiosInstance.get(`https://domo.ayy.fi/apartments/in_application/${applicationId}?include_points=true`)

  delete axiosInstance.defaults.headers['X-CSRF-Token']
  delete axiosInstance.defaults.headers['Content-Type']
  delete axiosInstance.defaults.headers.Accept

  const parsedResponse: { apartments: Apartment[] } = application.data
  const applicationRanking: Ranking = {}
  const oldApplicationRanking: Ranking = oldRanking[applicationId] !== undefined ? oldRanking[applicationId] : {}

  function addApt (apartment): void {
    applicationRanking[apartment.apartment_type_id] = {
      rank: apartment.rank,
      bestRankId: apartment.id
    }
  }

  for (const apartment of parsedResponse.apartments) {
    if (Object.prototype.hasOwnProperty.call(applicationRanking, apartment.apartment_type_id) as boolean) {
      const aptGroup = applicationRanking[apartment.apartment_type_id]
      if (apartment.rank < aptGroup.rank) {
        addApt(apartment)
      }
      continue
    }
    addApt(apartment)
  }

  // @ts-expect-error
  const channel = await client.channels.fetch(process.env.CHANNEL_ID) as TextChannel
  for (const queueId in applicationRanking) {
    const group = applicationRanking[queueId]
    const oldGroup = oldApplicationRanking[queueId]
    if (oldGroup !== undefined && group.rank === oldGroup.rank) continue
    const apt = parsedResponse.apartments.find((apt) => apt.id === group.bestRankId)
    if (apt === undefined) continue
    const embed = new EmbedBuilder()
      .setColor(0x55307f)
      .setTitle('AYY-asunnon jonosijoitus on muuttunut')
      .addFields([
        {
          name: 'Sijoitus',
          value: `${apt.rank}/${apt.queued_applications_count} ${oldGroup?.rank !== undefined ? `(oli viimeksi ${oldGroup.rank})` : ''}`
        },
        {
          name: 'Osoite',
          value: `${apt.building.street_address}`
        },
        {
          name: 'Tyyppi',
          value: `${ApartmentType[apt.plan_type]}`
        },
        {
          name: 'Kerros',
          value: `${apt.floor}`
        },
        {
          name: 'Vuokra',
          value: `${apt.humanized_rent}`
        }
      ])
      .setURL(`https://domo.ayy.fi/applications/${applicationId}`)
      .setImage(`https://domo.ayy.fi${apt.large_plan_image}`)
      .setTimestamp()
    await channel.send({ embeds: [embed] })
  }
  oldRanking[applicationId] = applicationRanking
  await fs.promises.writeFile(`./data/ranking/${applicationId}.json`, JSON.stringify(applicationRanking))
}

async function sleep (ms: number): Promise<unknown> {
  return await new Promise((resolve) => {
    setTimeout(() => {
      resolve(null)
    }, ms)
  })
}
