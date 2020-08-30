(function (module, require) {

	const AreaData = require('../../../modules/AreaData');

	const Feedback = require('./Feedback');
	const GameAnalyzer = require('./GameAnalyzer');
	const GameData = require("../../../modules/GameData");

	const clear = (function () {
		const defaults = {
			range: 14,
			spectype: 0,
			once: false,
			nodes: [],
		};
		const shamans = [sdk.monsters.FallenShaman, sdk.monsters.CarverShaman2, sdk.monsters.DevilkinShaman2, sdk.monsters.DarkShaman1, sdk.monsters.WarpedShaman, sdk.monsters.CarverShaman, sdk.monsters.DevilkinShaman, sdk.monsters.DarkShaman2],
			fallens = [sdk.monsters.Fallen, sdk.monsters.Carver2, sdk.monsters.Devilkin2, sdk.monsters.DarkOne1, sdk.monsters.WarpedFallen, sdk.monsters.Carver1, sdk.monsters.Devilkin, sdk.monsters.DarkOne2];

		const clearDistance = (x, y, xx, yy) => {

			getUnits(1).forEach((monster) => {
				if (typeof monster['beendead'] === 'undefined') monster.beendead = false;
				monster.beendead |= monster.dead
			});

			let path = getPath(me.area, x, y, xx, yy, 0, this.walkDistance);
			if (!path || !path.length) return Infinity;

			return path.reduce((acc, v, i, arr) => {
				let prev = i ? arr[i - 1] : v;
				return acc + Math.sqrt((prev.x - v.x) * (prev.x - v.x) + (prev.y - v.y) * (prev.y - v.y));
			}, 0);
		};

		const ret = (function (_settings = {}) {
			const settings = Object.assign({}, defaults, _settings);
			const pathCopy = settings.nodes.slice();
			let nearestNode = pathCopy.sort((a, b) => a.distance - b.distance).first();

			const backTrack = () => {

				const index = settings.nodes.indexOf(nearestNode);
				if (index > 0) {

					//ToDo; backtrack further if that is a safer bet

					const nodesBack = Math.min(index, 1);
					console.debug('backtracking ' + nodesBack + ' nodes');
					nearestNode = settings.nodes[index - nodesBack];
					nearestNode.moveTo();
				}
			};

			let start = [], startArea = me.area;
			const getUnits_filtered = () => getUnits(1, -1)
				.filter(unit =>
					global['__________ignoreMonster'].indexOf(unit.gid) === -1 // Dont attack those we ignore
					&& unit.hp > 0 // Dont attack those that have no health 	(catapults and such)
					&& unit.attackable // Dont attack those we cant attack
					&& unit.area === me.area
					&& (
						start.length // If start has a length
							? getDistance(start[0], start[1], unit) < settings.range // If it has a range smaller as from the start point (when using me.clear)
							: getDistance(this, unit) < settings.range // if "me" move, the object doesnt move. So, check distance of object
					)
					&& !checkCollision(me, unit, 0x4)
				)
				.filter(unit => {
					if (!settings.spectype || typeof settings.spectype !== 'number') return true; // No spectype =  all monsters
					return unit.spectype & settings.spectype;
				})
				.filter(unit => {
					const skill = GameData.monsterEffort(unit, unit.area);
					return skill.effort <= 6;
				})
				.sort((a, b) => {
					// shamans are a mess early game
					let isShamanA = shamans.indexOf(a.classid) > -1;
					let isFallenB = fallens.indexOf(b.classid) > -1;
					if (isShamanA && isFallenB && checkCollision(me, unit, 0x7)/*line of sight*/) {
						// return shaman first, if we have a direct line of sight
						return -1;
					}
					if (typeof a['beendead'] !== 'undefined' && typeof b['beendead'] === 'undefined' && a['beendead'] && !b['beendead']) {
						return 1; // those that been dead before (aka fallens) will be moved up from the list, so we are more likely to pwn shamans on a safe moment
					}
					return clearDistance(me.x, me.y, a.x, a.y) - (clearDistance(me.x, me.y, b.x, b.y));
				});

			// If we clear around _me_ we move around, but just clear around where we started
			let units;
			if (me === this) start = [me.x, me.y];

			while ((units = getUnits_filtered()).length) {
				if (getUnits(1).filter(unit => unit.attackable && unit.distance < 5).length >= 3) {
					backTrack();
					continue; // we maybe wanna attack someone else now
				}
				const unit = units.shift();

				// Do something with the effort to not kill monsters that are too harsh
				unit.attack();

				if (settings.once || startArea !== me.area) return true;
			}
			return true;
		}).bind(me);
		ret.defaults = defaults;
		return ret;
	})();

	const FastestPath = (nodes, timeLimit = 250) => {
		nodes = nodes.filter(_ => _ && _.hasOwnProperty('x') && _.hasOwnProperty('y'));
		const hooks = [];

		const calcDistance = () => {
			let sum = 0;
			for (let i = 1; i < nodes.length; i++) {
				sum += getPath(me.area, nodes[i - 1].x, nodes[i - 1].y, nodes[i].x, nodes[i].y, 0, 25)
					.map((el, i, self) => i && getDistance(el.x, el.y, self[i - 1].x, self[i - 1].y) || 0)
					.reduce((acc, cur) => acc + cur, 0);

			}
			return sum;
		};


		let recordDistance = calcDistance();
		let winningPath = nodes.slice(); // current

		let x, y, d;
		const singleRun = () => {
			x = rand(1, nodes.length) - 1;
			y = rand(1, nodes.length) - 1;

			if (x === y) return;

			const tmp = nodes[x];
			nodes[x] = nodes[y];
			nodes[y] = tmp;

			hooks.forEach(line => line.remove());

			d = calcDistance();

			if (d < recordDistance) {
				console.debug('Winning path?');
				recordDistance = d;
				winningPath.forEach(() => winningPath.pop());
				nodes.forEach(node => winningPath.push(node));
			}
		};

		let tick = getTickCount();

		console.debug('Fastest path');
		while (getTickCount() - tick < timeLimit) singleRun();

		return {
			winningPath: winningPath,
			singleRun: singleRun,
		};
	};
	FastestPath.DebugLines = [];

	const searchShrine = () => getUnits(2, "shrine")
		.filter(el => el.objtype === 15 && !el.mode)
		.sort((a, b) => (a.objtype - b.objtype) || a.distance - b.distance)
		.first();

	module.exports = function (dungeonName, Config, Attack, Pickit, Pather, Town, Misc) {
		const wantToSell = () => {
			let isLowOnGold = me.gold < Config.LowGold;
			console.debug('Low on gold =O');

			let reasonsToShop = [0, -1];
			if (isLowOnGold) reasonsToShop.unshift(4);

			return (me.getItems() || [])
				.filter(el => el.location === sdk.storage.Inventory)
				.some(item => reasonsToShop.includes(Pickit.checkItem(item)));
		};
		// print('Running ' + dungeonName);

		// make copy of array
		let dungeons = AreaData.dungeons.hasOwnProperty(dungeonName) ? AreaData.dungeons[dungeonName] : [dungeonName];

		// strip leading areas, if we are already at that location
		let currentAreaIndex = dungeons.indexOf(me.area);
		if (currentAreaIndex > -1) {
			// Add to skip list
			dungeons.slice(0, currentAreaIndex).forEach(el => GameAnalyzer.skip.push(el));

			// Remove the area
			dungeons = dungeons.slice(currentAreaIndex);
		}


		// print(dungeons);
		const plot = Pather.plotCourse(dungeons.first(), me.area);
		if (!plot) throw Error('couldnt find path');

		if (plot.useWP && plot.course.first() !== me.area) {
			console.debug('Gonna use waypoint..?');
			Pather.getWP(plot.course.first());
			Pather.useWaypoint(plot.course.first());
		} else if (plot.course.length) {
			console.debug('Adding areas to dungeon area, as we need to walk');

			plot.course.pop(); // the last is the first dungeon area, that is already in the list
			plot.course.reverse().forEach(el => dungeons.unshift(el));
		}

		dungeons.every((area, index, self) => {

			let actualDungeonArea = !!Object.keys(AreaData.dungeons).find(key => AreaData.dungeons[key].includes(area));
			let lastArea = index === self.length - 1;

			console.debug(actualDungeonArea ? 'Need to walk trough ' + AreaData[area].LocaleString : 'Clearing area ' + AreaData[area].LocaleString);

			// to be sure
			Pather.journeyTo(area);
			if (me.area !== area) return false;

			let targets = [], preset;

			// if this is a waypoint area, run to wards the waypoint
			if (Pather.wpAreas.includes(me.area) && !getWaypoint(me.area)) {
				const wpIDs = [119, 145, 156, 157, 237, 238, 288, 323, 324, 398, 402, 429, 494, 496, 511, 539];
				for (let i = 0; i < wpIDs.length || preset; i += 1) {
					if ((preset = getPresetUnit(area, 2, wpIDs[i]))) {
						console.debug('Added waypoint to the list');
						targets.push(preset);
						break;
					}
				}
			}

			// if this isnt the last area of target, our goal is to run towards an exit
			if (!lastArea) {
				let area = getArea();

				let exits = area.exits;
				let exit = exits && exits.find(el => el.target === self[index + 1]);

				if (exit) {
					exit.isExit = true;
					targets.push(exit);
				}
			}

			const getExit = (id = 0) => getArea().exits.sort((a, b) => b - a).find(el => !id || el.target === id);
			const exitTarget = {};
			exitTarget[sdk.areas.BloodMoor] = sdk.areas.ColdPlains;
			exitTarget[sdk.areas.ColdPlains] = sdk.areas.StonyField;
			switch (area) {
				case sdk.areas.ColdPlains:
				case sdk.areas.BloodMoor: {
					if (lastArea) {
						// in the blood more, we simply wanna walk towards the otherside of it. In this case, cold plains
						console.debug('Now that we are here, just follow trough the exit - ' + AreaData[exitTarget[area]].LocaleString);
						const exit = getExit(exitTarget[area]);
						if (exit) {
							exit.isExit = true;
							targets.push(exit);
						}
					}
					break;
				}
			}

			const visitPresets = {};
			visitPresets[sdk.areas.Mausoleum] = [[1, 802], [2, 29]];

			if (visitPresets.hasOwnProperty(area)) {

				const visitNodes = visitPresets[area].map(getPresetUnit.bind(null, area)).map(preset => ({
					x: (preset.roomx * 5 + preset.x),
					y: (preset.roomy * 5 + preset.y),
				}));


				// calculate what is the shortest to walk between
				let nodes = FastestPath(visitNodes);

				let nearestNode = nodes.indexOf(nodes.slice().sort((a, b) => a.distance - b.distance).first());

				// If nearnest node isnt he first, we need to remove the index's in-front and push it to the end
				if (nearestNode > 0) for (let i = 0; i < nearestNode; i++) nodes.push(nodes.shift());

				// now the first node is the one most nearby, add them to targets, in-front of the line
				nodes.reverse().forEach(node => targets.unshift(node));
			}


			const walkTo = (target, recursion = 0) => {

				const path = Pather.useTeleport() ? getPath(me.area, target.x, target.y, me.x, me.y, 1, 40) : getPath(me.area, target.x, target.y, me.x, me.y, 1, 4);
				if (!path) throw new Error('failed to generate path');

				path.reverse();

				const lines = path.map((node, i, self) => i/*skip first*/ && new Line(self[i - 1].x, self[i - 1].y, node.x, node.y, 0x33, true));

				const pathCopy = path.slice();
				let loops = 0, shrine;
				for (let i = 0, node, l = path.length; i < l; loops++) {

					node = path[i];
					// console.debug('Moving to node (' + i + '/' + l + ') -- ' + Math.round(node.distance * 100) / 100);

					node.moveTo();

					// ToDo; only if clearing makes sense in this area due to effort
					clear({nodes: path});
					Pickit.pickItems();

					// if shrine found, click on it
					(shrine = searchShrine()) && shrine.click();

					// if this wasnt our last node
					if (l - 1 !== i) {

						// Sometimes we go way out track due to clearing,
						// lets find the nearest node on the path and go from there
						let nearestNode = pathCopy.sort((a, b) => a.distance - b.distance).first();

						// if the nearnest node is still in 95% of our current node, we dont need to reset
						if (nearestNode.distance > 5 && node.distance > 5 && 100 / node.distance * nearestNode.distance < 95) {

							console.debug('reseting path to other node');
							// reset i to the nearest node
							i = path.findIndex(node => nearestNode.x === node.x && nearestNode.y === node.y);
							continue; // and there for no i++
						}
					}

					i++;
				}
				console.debug('Took ' + loops + ' to continue ' + path.length + ' steps');
			};

			targets.forEach(target => {
				console.debug('Walking? -- ' + target.x + ', ' + target.y);

				walkTo(target);

				if (target.hasOwnProperty('isExit') && target.isExit) {
					const currExit = target;

					if (currExit.type === 1) {// walk through

						let targetRoom = Pather.getNearestRoom(currExit.target);
						if (targetRoom) targetRoom.moveTo();

					} else if (currExit.type === 2) {// stairs
						!Pather.openExit(currExit.target) && !Pather.useUnit(5, currExit.tileid, currExit.target);
					}

				}

				// if we are near a waypoint, click it if we dont got it yet
				if (target.hasOwnProperty('type')) {

					let wp = getUnit(2, "waypoint");
					if (wp && wp.mode !== 2) {
						wp.moveTo();
						Misc.poll(() => {
							wp.click();
							return getUIFlag(sdk.uiflags.Waypoint) || wp.mode !== 2;
						}, 6000, 30);

						console.debug('wanna go to town?');
						if (wantToSell()) {
							console.debug('wanna go home');
							// take wp to local town
							Pather.useWaypoint(AreaData[me.area].townArea().Index);

							const npc = Town.initNPC("Shop", "identify");
							if (npc) {
								console.debug('sell the crap');
								Town.identify();
							}

							Pather.useWaypoint(area);

						}

						getUIFlag(sdk.uiflags.Waypoint) && me.cancel();
					}
				}
			});

			GameAnalyzer.skip.push(area);

			switch (me.area) {
				case sdk.areas.DenOfEvil: {
					if (me.getQuest(1, 0)) break;
					let lines;

					const corpseFire = (poi => ({
						x: poi.roomx * 5 + poi.x,
						y: poi.roomy * 5 + poi.y,
					}))(getPresetUnit(sdk.areas.DenOfEvil, 1, 774));

					const myPathToCorpse = getPath(me.area, me.x, me.y, corpseFire.x, corpseFire.y, 0, 25).map(el => el.distance).reduce((acc, cur) => acc + cur, 0);

					const rooms = (function (room, ret = []) {
						do {
							let obj = {
								x: room.x * 5 + room.xsize / 2,
								y: room.y * 5 + room.ysize / 2,
								d: 0,
								c: 0,
								s: 0,
							};
							let result = Pather.getNearestWalkable(obj.x, obj.y, 18, 3);
							if (result) {
								let [x, y] = result;
								obj.x = x;
								obj.y = y;
								obj.d = getPath(me.area, x, y, me.x, me.y, 0, 25).map(el => el.distance).reduce((acc, cur) => acc + cur, 0);
								console.debug(corpseFire.x + ',' + corpseFire.y);
								obj.c = getPath(me.area, x, y, corpseFire.x, corpseFire.y, 0, 25).map(el => el.distance).reduce((acc, cur) => acc + cur, 0);

								obj.s = (obj.d * 2) - obj.c;
								console.debug(x, y, Math.round(obj.d), Math.round(obj.c), ' -', Math.round(obj.s));

								ret.push(obj);
							}
						} while (room.getNext());
						return ret;
					})(getRoom());

					// console.debug(rooms);

					// let fastestPath = FastestPath(rooms, 2500);
					// let nodes = fastestPath.winningPath;
					let nodes = rooms;

					nodes.sort((a, b) => (a.s - b.s));
					lines = nodes.map((node, i, self) => i/*skip first*/ && new Line(self[i - 1].x, self[i - 1].y, node.x, node.y, 0x84, true));


					let _cacheRange = clear.defaults.range;
					clear.defaults.range = 20;

					rooms.some(node => {
						walkTo(node);
						return me.getQuest(1, 0);
					});

					clear.defaults.range = _cacheRange;

					break;
				}
				case sdk.areas.TowerCellarLvl5: {
					// cunt-ress pwnage
					let poi = getPresetUnit(me.area, 2, 580);

					if (!poi) return false;

					switch (poi.roomx * 5 + poi.x) {
						case 12565:
							Pather.moveTo(12578, 11043);
							break;
						case 12526:
							Pather.moveTo(12548, 11083);
							break;
					}

					Attack.clear(20, 0, getLocaleString(2875)); // The Countess
				}
			}
			return true;
		});
	}

})(module, require);