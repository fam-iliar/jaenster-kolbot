Unit.prototype.equip = function (destLocation = undefined) {
	const Storage = require('Storage');
	let spot;
	const doubleHanded = [26, 27, 34, 35, 67, 85, 86],
		findspot = function (item) {
			let tempspot = Storage.Stash.FindSpot(item);

			if (getUIFlag(0x19) && tempspot) {
				return {location: Storage.Stash.location, coord: tempspot};
			}

			tempspot = Storage.Inventory.FindSpot(item);

			if (tempspot) {
				return {location: Storage.Inventory.location, coord: tempspot};
			}

			return false; // no spot found
		};

	// Not an item, or unidentified, or not enough stats
	if (this.type !== 4 || !this.getFlag(0x10) || this.getStat(sdk.stats.Levelreq) > me.getStat(sdk.stats.Level) || this.dexreq > me.getStat(sdk.stats.Dexterity) || this.strreq > me.getStat(sdk.stats.Strength)) {
		return false;
	}

	// If not a specific location is given, figure it out (can be useful to equip a double weapon)
	(destLocation || (destLocation = this.getBodyLoc())) && !Array.isArray(destLocation) && (destLocation = [destLocation]);

	print('equiping ' + this.name);

	if (this.location === sdk.storage.Equipment) {
		return true; // Item is already equiped
	}


	let currentEquiped = me.getItems(-1).filter(item =>
		destLocation.indexOf(item.bodylocation) !== -1
		|| ( // Deal with double handed weapons

			(item.bodylocation === 4 || item.bodylocation === 5)
			&& [4, 5].indexOf(destLocation) // in case destination is on the weapon/shield slot
			&& (
				doubleHanded.indexOf(this.itemType) !== -1 // this item is a double handed item
				|| doubleHanded.indexOf(item.itemType) !== -1 // current item is a double handed item
			)
		)
	).sort((a, b) => b - a); // shields first


	// if nothing is equipped at the moment, just equip it
	if (!currentEquiped.length) {
		clickItemAndWait(0, this);
		clickItemAndWait(0, destLocation.first());
	} else { // unequip / swap items
		currentEquiped.forEach((item, index) => {

			// Last item, so swap instead of putting off first
			if (index === (currentEquiped.length - 1)) {
				print('swap ' + this.name + ' for ' + item.name);
				D2Bot.printToConsole('Swapping item ' + this.name + ' for ' + item.name);
				require('Config').Debug && D2Bot.printToConsole('New\r\n' + this.description + '\r\n -- Old\r\n' + item.description);
				let oldLoc = {x: this.x, y: this.y, location: this.location};
				clickItemAndWait(0, this); // Pick up current item
				clickItemAndWait(0, destLocation.first()); // the swap of items

				// Find a spot for the current item
				spot = findspot(item);
				print('Find spot for old item? ' + (spot));

				if (!spot) { // If no spot is found for the item, rollback
					clickItemAndWait(0, destLocation.first()); // swap again
					clickItemAndWait(0, oldLoc.x, oldLoc.y, oldLoc.location); // put item back on old spot
					throw Error('cant find spot for unequipped item');
				}

				clickItemAndWait(0, spot.coord.y, spot.coord.x, spot.location); // put item on the found spot

				return;
			}

			print('Unequip item first ' + item.name);
			// Incase multiple items are equipped
			spot = findspot(item); // Find a spot for the current item

			if (!spot) {
				throw Error('cant find spot for unequipped item');
			}

			clickItemAndWait(0, item.bodylocation);
			clickItemAndWait(0, spot.coord.x, spot.coord.y, spot.location);
		});
	}

	return {
		success: this.bodylocation === destLocation.first(),
		unequiped: currentEquiped,
		rollback: () => currentEquiped.forEach(item => item.equip()) // Note; rollback only works if you had other items equipped before.
	};
};

Unit.prototype.getBodyLoc = function () {
	let types = {
		1: [37, 71, 75], // helm
		2: [12], // amulet
		3: [3], // armor
		4: [24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 42, 43, 44, 67, 68, 69, 72, 85, 86, 87, 88], // weapons
		5: [2, 5, 6, 70], // shields / Arrows / bolts
		6: [10], // ring slot 1
		7: [10], // ring slot 2
		8: [19], // belt
		9: [15], // boots
		10: [16], // gloves
	}, bodyLoc = [];

	for (let i in types) {
		this.itemType && types[i].indexOf(this.itemType) !== -1 && bodyLoc.push(i);
	}

	return bodyLoc.map(loc => parseInt(loc));
};

Object.defineProperties(Unit.prototype, {
	identified: {
		get: function () {
			if (this.type !== sdk.unittype.Item) return undefined; // Can't tell, as it isn't an item

			return this.getFlag(0x10);
		}
	}
});

(function () {
	const fields = ['x', 'y', 'sizex', 'sizey', 'classid', 'hpmax', 'itemcount', 'uniqueid', 'code', 'fname', 'quality', 'node', 'location', 'description', 'ilvl', 'lvlreq', 'gfx'];
	Object.defineProperty(Unit.prototype, 'uniqueId', {
		get: function () {
			let text = fields.map(key => (this.hasOwnProperty(key) && this[key] || '').toString()).filter(x => x);
			return md5(JSON.stringify(text));
		}
	});
})();


// You MUST use a delay after Unit.sell() if using custom scripts. delay(500) works best, dynamic delay is used when identifying/selling (500 - item id time)
Unit.prototype.sell = function () {
	const Config = require('Config');
	const Packet = require('PacketHelpers');
	if (Config.PacketShopping) {
		return Packet.sellItem(this);
	}

	if (this.type !== 4) { // Check if it's an item we want to buy
		throw new Error("Unit.sell: Must be used on items.");
	}

	if (!getUIFlag(0xC)) { // Check if it's an item belonging to a NPC
		throw new Error("Unit.sell: Must be used in shops.");
	}

	var i, tick,
		itemCount = me.itemcount;

	for (i = 0; i < 5; i += 1) {
		this.shop(1);

		tick = getTickCount();

		while (getTickCount() - tick < 2000) {
			if (me.itemcount !== itemCount) {
				//delay(500);

				return true;
			}

			delay(10);
		}
	}

	return false;
};

Unit.prototype.toCursor = function () {
	if (this.type !== 4) {
		throw new Error("Unit.toCursor: Must be used with items.");
	}

	if (me.itemoncursor && this.mode === 4) {
		return true;
	}

	let i, tick;

	if (this.location === 7) {
		const Town = require('NPC');
		Town.openStash();
	}

	if (this.location === 6) {
		me.openCube();
	}

	for (i = 0; i < 3; i += 1) {
		try {
			if (this.mode === 1) {
				clickItem(0, this.bodylocation); // fix for equipped items (cubing viper staff for example)
			} else {
				clickItem(0, this);
			}
		} catch (e) {
			return false;
		}

		tick = getTickCount();

		while (getTickCount() - tick < 1000) {
			if (me.itemoncursor) {
				delay(200);

				return true;
			}

			delay(10);
		}
	}

	return false;
};

Unit.prototype.drop = function () {
	if (this.type !== 4) {
		throw new Error("Unit.drop: Must be used with items.");
	}

	var i, tick, timeout;

	if (!this.toCursor()) {
		return false;
	}

	tick = getTickCount();
	timeout = Math.max(1000, me.ping * 6);

	while (getUIFlag(0x1a) || getUIFlag(0x19) || !me.gameReady) {
		if (getTickCount() - tick > timeout) {
			return false;
		}

		if (getUIFlag(0x1a) || getUIFlag(0x19)) {
			me.cancel(0);
		}

		delay(me.ping * 2 + 100);
	}

	for (i = 0; i < 3; i += 1) {
		clickMap(0, 0, me.x, me.y);
		delay(40);
		clickMap(2, 0, me.x, me.y);

		tick = getTickCount();

		while (getTickCount() - tick < 500) {
			if (!me.itemoncursor) {
				delay(200);

				return true;
			}

			delay(10);
		}
	}

	return false;
};

// Item owner name
Object.defineProperty(Unit.prototype, "parentName", {
	get: function () {
		if (this.type !== 4) {
			throw new Error("Unit.parentName: Must be used with item units.");
		}

		var parent = this.getParent();

		if (parent) {
			return parent.name;
		}

		return false;
	},
	enumerable: true
});

Unit.prototype.getPrefix = function (id) {
	var i;

	switch (typeof id) {
		case "number":
			if (typeof this.prefixnums !== "object") {
				return this.prefixnum === id;
			}

			for (i = 0; i < this.prefixnums.length; i += 1) {
				if (id === this.prefixnums[i]) {
					return true;
				}
			}

			break;
		case "string":
			if (typeof this.prefixes !== "object") {
				return this.prefix.replace(/\s+/g, "").toLowerCase() === id.replace(/\s+/g, "").toLowerCase();
			}

			for (i = 0; i < this.prefixes.length; i += 1) {
				if (id.replace(/\s+/g, "").toLowerCase() === this.prefixes[i].replace(/\s+/g, "").toLowerCase()) {
					return true;
				}
			}

			break;
	}

	return false;
};

Unit.prototype.getSuffix = function (id) {
	var i;

	switch (typeof id) {
		case "number":
			if (typeof this.suffixnums !== "object") {
				return this.suffixnum === id;
			}

			for (i = 0; i < this.suffixnums.length; i += 1) {
				if (id === this.suffixnums[i]) {
					return true;
				}
			}

			break;
		case "string":
			if (typeof this.suffixes !== "object") {
				return this.suffix.replace(/\s+/g, "").toLowerCase() === id.replace(/\s+/g, "").toLowerCase();
			}

			for (i = 0; i < this.suffixes.length; i += 1) {
				if (id.replace(/\s+/g, "").toLowerCase() === this.suffixes[i].replace(/\s+/g, "").toLowerCase()) {
					return true;
				}
			}

			break;
	}

	return false;
};



Object.defineProperty(Unit.prototype, "dexreq", {
	get: function () {
		var finalReq,
			ethereal = this.getFlag(0x400000),
			reqModifier = this.getStat(91),
			baseReq = getBaseStat("items", this.classid, "reqdex");

		finalReq = baseReq + Math.floor(baseReq * reqModifier / 100);

		if (ethereal) {
			finalReq -= 10;
		}

		return Math.max(finalReq, 0);
	},
	enumerable: true
});

Object.defineProperty(Unit.prototype, "strreq", {
	get: function () {
		var finalReq,
			ethereal = this.getFlag(0x400000),
			reqModifier = this.getStat(91),
			baseReq = getBaseStat("items", this.classid, "reqstr");

		finalReq = baseReq + Math.floor(baseReq * reqModifier / 100);

		if (ethereal) {
			finalReq -= 10;
		}

		return Math.max(finalReq, 0);
	},
	enumerable: true
});

Object.defineProperty(Unit.prototype, 'itemclass', {
	get: function () {
		if (getBaseStat(0, this.classid, 'code') === undefined) {
			return 0;
		}

		if (getBaseStat(0, this.classid, 'code') === getBaseStat(0, this.classid, 'ultracode')) {
			return 2;
		}

		if (getBaseStat(0, this.classid, 'code') === getBaseStat(0, this.classid, 'ubercode')) {
			return 1;
		}

		return 0;
	},
	enumerable: true
});


/**
 * @description Return the items of a player, or an empty array
 * @param args
 * @returns Unit[]
 */
Unit.prototype.getItems = function (...args) {
	let item = this.getItem.apply(this, args), items = [];

	if (item) {
		do {
			items.push(copyUnit(item));
		} while (item.getNext());
		return items;
	}

	return [];
};

Object.defineProperty(Unit.prototype, "skinCode", {
	get: function() {
		var code;
		if (this.getFlag(0x10)) {
			switch (this.quality) {
				case 5: // Set
					switch (this.classid) {
						case 27: // Angelic sabre
							code = "inv9sbu";

							break;
						case 74: // Arctic short war bow
							code = "invswbu";

							break;
						case 308: // Berserker's helm
							code = "invhlmu";

							break;
						case 330: // Civerb's large shield
							code = "invlrgu";

							break;
						case 31: // Cleglaw's long sword
						case 227: // Szabi's cryptic sword
							code = "invlsdu";

							break;
						case 329: // Cleglaw's small shield
							code = "invsmlu";

							break;
						case 328: // Hsaru's buckler
							code = "invbucu";

							break;
						case 306: // Infernal cap / Sander's cap
							code = "invcapu";

							break;
						case 30: // Isenhart's broad sword
							code = "invbsdu";

							break;
						case 309: // Isenhart's full helm
							code = "invfhlu";

							break;
						case 333: // Isenhart's gothic shield
							code = "invgtsu";

							break;
						case 326: // Milabrega's ancient armor
						case 442: // Immortal King's sacred armor
							code = "invaaru";

							break;
						case 331: // Milabrega's kite shield
							code = "invkitu";

							break;
						case 332: // Sigon's tower shield
							code = "invtowu";

							break;
						case 325: // Tancred's full plate mail
							code = "invfulu";

							break;
						case 3: // Tancred's military pick
							code = "invmpiu";

							break;
						case 113: // Aldur's jagged star
							code = "invmstu";

							break;
						case 234: // Bul-Kathos' colossus blade
							code = "invgsdu";

							break;
						case 372: // Grizwold's ornate plate
							code = "invxaru";

							break;
						case 366: // Heaven's cuirass
						case 215: // Heaven's reinforced mace
						case 449: // Heaven's ward
						case 426: // Heaven's spired helm
							code = "inv" + this.code + "s";

							break;
						case 357: // Hwanin's grand crown
							code = "invxrnu";

							break;
						case 195: // Nalya's scissors suwayyah
							code = "invskru";

							break;
						case 395: // Nalya's grim helm
						case 465: // Trang-Oul's bone visage
							code = "invbhmu";

							break;
						case 261: // Naj's elder staff
							code = "invcstu";

							break;
						case 375: // Orphan's round shield
							code = "invxmlu";

							break;
						case 12: // Sander's bone wand
							code = "invbwnu";

							break;
					}

					break;
				case 7: // Unique
					for (var i = 0; i < 401; i += 1) {
						if (this.fname.split("\n").reverse()[0].indexOf(getLocaleString(getBaseStat(17, i, 2))) > -1) {
							code = getBaseStat(17, i, "invfile");

							break;
						}
					}

					break;
			}
		}

		if (!code) {
			if (["ci2", "ci3"].indexOf(this.code) > -1) { // Tiara/Diadem
				code = this.code;
			} else {
				code = getBaseStat(0, this.classid, 'normcode') || this.code;
			}

			code = code.replace(" ", "");

			if ([10, 12, 58, 82, 83, 84].indexOf(this.itemType) > -1) { // ring/amu/jewel/sc/lc/gc
				code += (this.gfx + 1);
			}
		}

		return code;
	},
	enumerable: true
});
