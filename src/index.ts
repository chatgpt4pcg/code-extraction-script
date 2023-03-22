import { appendLog, createLogFolder, createOutputFolder, listAllDirs, listAllFiles, listCharactersDirs } from './file-utils';

import BigNumber from 'bignumber.js'
import fs from 'fs'
import parseArgs from 'minimist'
import path from 'path'

type StabilityResult = {
  dataCount: number, rate: number, raws: { tag: string, score: number }[]
}

type SimilarityResult = {
  count: number, similarityRate: number, trials: { id: string, label: string, similarity: number }[], similarities: { id: string, raws: { id: string, label: string, softmax_prob: number }[] }[]
}

//TODO: Re add logs


const STAGE_STABILITY = 'stability'
const STAGE_SIMILARITY = 'similarity'

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const argv = process.platform === 'win32' ? args['_'] : args['s']
  if (argv === undefined) {
    throw Error('Insufficient parameters to work with.')
  }

  const sourceFolder = argv + '/'
  const sFolder = path.posix.resolve(sourceFolder)

  const weights = await calculateWeight(sFolder)
  console.log('weights', weights.map(w => ({ character: w.character, weight: w.weight.toFixed(), weightStability: w.weightStability.toFixed(), weightSimilarity: w.weightSimilarity.toFixed() })))

  const logFolderPath = await createLogFolder(sFolder)
  const teamFolders = await listAllDirs(sFolder)
  const promptScores = []

  for (const team of teamFolders) {
    const path1 = path.posix.join(sFolder, team)

    let stability = [] as string[]
    let similarity = [] as string[]

    try {
      const stabilityPath = path.posix.join(path1, STAGE_STABILITY)
      const similarityPath = path.posix.join(path1, STAGE_SIMILARITY)
      stability = await listAllFiles(stabilityPath)
      similarity = await listAllFiles(similarityPath)
    } catch (e) {
    }

    const characterScores = []

    if (stability.length !== 0 && similarity.length !== 0) {
      for (const character of similarity) {
        const path_st2 = path.posix.join(path1, STAGE_STABILITY, character)
        const path_si2 = path.posix.join(path1, STAGE_SIMILARITY, character)

        const stabilityFile = await fs.promises.readFile(path_st2, 'utf8')
        const similarityFile = await fs.promises.readFile(path_si2, 'utf8')

        const stabilityResult = await JSON.parse(stabilityFile) as StabilityResult
        const similarityResult = await JSON.parse(similarityFile) as SimilarityResult

        const trialScores = []
        // TODO: Make 10 dynamics
        for (let i = 0; i < 10; i++) {
          const trialStability = stabilityResult.raws[i].score
          const trialSimilarity = similarityResult.trials[i].similarity
          console.log('stability', team, character, i + 1, trialStability)
          console.log('similarity', team, character, i + 1, trialSimilarity)
          const trialScore = weights.find(w => w.character === character)?.weight.multipliedBy(trialStability).multipliedBy(trialSimilarity)
          trialScores.push(trialScore)
          console.log('trial_score', team, character, i + 1, trialScore?.toFixed())
        }

        const characterScore = trialScores.reduce((acc, cur) => acc?.plus(cur || new BigNumber(0)), new BigNumber(0))?.dividedBy(10) //TODO: Make 10 dynamics
        characterScores.push(characterScore)
        console.log('character_score', team, character, characterScore?.toFixed())
      }
    }
    const promptScore = characterScores.reduce((acc, cur) => acc?.plus(cur || new BigNumber(0)), new BigNumber(0))?.dividedBy(characterScores.length)
    promptScores.push({ team, promptScore })
    console.log('prompt_score', team, promptScore?.toFixed())
  }

  let competitionScore = new BigNumber(0)
  for (const promptScore of promptScores) {
    competitionScore = competitionScore.plus(promptScore.promptScore || new BigNumber(0))
  }
  console.log('competition_score', competitionScore.toFixed())
  const normPromptScores = promptScores.map(p => ({ team: p.team, promptScore: p.promptScore?.dividedBy(competitionScore).multipliedBy(100) })).sort((a, b) => a.promptScore?.gt(b.promptScore || new BigNumber(0)) ? -1 : 1).map(p => ({ team: p.team, promptScore: p.promptScore?.toFixed() }))
  console.log(console.log('normalized_prompt_score', normPromptScores))
  //TODO: Produce CSV output file nicely
  // Column: team_name, character, trial, trial_score, stability_score, similarity_score
  // TODO: Produce CSV output file nicely
  // Column: team_name, character, character_score
  //TODO: Produce CSV output file nicely
  // Column: team_name, prompt_score, normalized_prompt_score
  //TODO: Produce JSON output file nicely
  // competition_score, character weights
}

main()

type CharacterWeight = {
  character: string,
  weightStability: BigNumber,
  weightSimilarity: BigNumber,
  weight: BigNumber
}

async function calculateWeight(sourceFolder: string) {
  const teamFolders = await listAllDirs(sourceFolder)

  const characterListPath = path.posix.join(sourceFolder, 'v1', STAGE_STABILITY) //TODO: make 'v1' dynamic
  const characterList = await listAllFiles(characterListPath)

  const characterWeights: CharacterWeight[] = []

  for (const character of characterList) {
    let sumOfStabilityOfAllTeams = new BigNumber(0)
    let sumOfSimilarityOfAllTeams = new BigNumber(0)

    for (const team of teamFolders) {
      const stabilityResultPath = path.posix.join(sourceFolder, team, STAGE_STABILITY, character)
      const stabilityFile = await fs.promises.readFile(stabilityResultPath, 'utf8')
      const stabilityResult = await JSON.parse(stabilityFile) as StabilityResult

      const trialStability = stabilityResult.raws.reduce((acc, cur) => acc.plus(new BigNumber(cur.score)), new BigNumber(0))
      sumOfStabilityOfAllTeams = sumOfStabilityOfAllTeams.plus(trialStability)

      const similarityResultPath = path.posix.join(sourceFolder, team, STAGE_SIMILARITY, character)
      const similarityFile = await fs.promises.readFile(similarityResultPath, 'utf8')
      const similarityResult = await JSON.parse(similarityFile) as SimilarityResult

      const trialSimilarity = similarityResult.trials.reduce((acc, cur) => acc.plus(new BigNumber(cur.similarity)), new BigNumber(0))
      sumOfSimilarityOfAllTeams = sumOfSimilarityOfAllTeams.plus(trialSimilarity)
    }

    const averageStability = sumOfStabilityOfAllTeams.dividedBy(teamFolders.length * 10)  //TODO: make 10 dynamic
    const weightStability = BigNumber.max(new BigNumber(1).minus(averageStability), new BigNumber(1).dividedBy(characterList.length))

    const averageSimilarity = sumOfSimilarityOfAllTeams.dividedBy(teamFolders.length * 10)  //TODO: make 10 dynamic
    const weightSimilarity = BigNumber.max(new BigNumber(1).minus(averageSimilarity), new BigNumber(1).dividedBy(characterList.length))

    characterWeights.push({
      character,
      weightStability,
      weightSimilarity,
      weight: weightStability.multipliedBy(weightSimilarity)
    })
  }
  return characterWeights
}