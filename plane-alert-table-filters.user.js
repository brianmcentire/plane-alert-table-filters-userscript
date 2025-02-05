// ==UserScript==
// @name         Plane-Alert Table Column Filters
// @namespace    https://github.com/brianmcentire/plane-alert-table-filters-userscript
// @version      1.0
// @description  Add filters to specific table columns with dynamic updates
// @author       Brian McEntire
// @license      MIT
// @match        http://*:*/*  // Consider refining if performance is a concern
// @include      /^http:\/\/[^\/]+:8088\/.*/
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/brianmcentire/plane-alert-table-filters-userscript/main/plane-alert-table-filters.user.js
// @updateURL    https://raw.githubusercontent.com/brianmcentire/plane-alert-table-filters-userscript/main/plane-alert-table-filters.user.js
// @homepageURL  https://github.com/brianmcentire/plane-alert-table-filters-userscript
// ==/UserScript==


(function() {
    'use strict';

    // Configuration object
    const CONFIG = {
        tableId: 'mytable',
        filterColumns: window.location.pathname.includes('/plane-alert/') ? {
            'Operator': 4,
            'Type': 5,
            'ICAO Type': 9,
            'Tag 1': 10,
            'Category': 11
        } : {
            'Airline or Owner': 3
        },
        styles: {
            filterRowBackground: '#f0f6f6',
            css: `
body {
  margin: 1 !important;
  padding: 1 !important;
}

#mytable {
  border-collapse: collapse;
  border-spacing: 0;
}

#mytable td {
  padding: 1 !important;
  margin: 1 !important;
}
                #mytable tr:nth-child(2) td {
                }

            `
        }
    };

    class TableFilter {
        constructor(config) {
            this.config = config;
            this.table = null;
            this.filterRow = null;
        }

        init() {
            this.removeAutoRefresh();
            this.table = document.getElementById(this.config.tableId);
            if (!this.table) return;

            this.addStyles();
            this.createFilterRow();
            this.populateFilterOptions();
            this.setupMutationObserver();
            this.setupNumericSorting();
        }

        removeAutoRefresh() {
            const metaRefresh = document.querySelector('meta[http-equiv="refresh"]');
            if (metaRefresh) {
                metaRefresh.remove();
            }
        }

        setupMutationObserver() {
            // Create a mutation observer to watch for changes to the table
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList') {
                        this.ensureFilterRowPosition();
                    }
                });
            });

            // Start observing the table for changes
            observer.observe(this.table, {
                childList: true,
                subtree: true
            });
        }

        ensureFilterRowPosition() {
            if (!this.filterRow) return;

            // Check if filter row is in the correct position
            if (this.table.rows[1] !== this.filterRow) {
                // Move filter row back to position 1
                const headerRow = this.table.rows[0];
                headerRow.after(this.filterRow);
            }
        }

        addStyles() {
            const style = document.createElement('style');
            style.textContent = this.config.styles.css + `
                #${this.config.tableId} th:not(:nth-child(2)) {
                    cursor: pointer;
                }
            `;
            document.head.appendChild(style);
        }



        createFilterRow() {
            const headerRow = this.table.rows[0];
            this.filterRow = this.table.insertRow(1);

            this.filterRow.style.backgroundColor = this.config.styles.filterRowBackground;
            this.filterRow.style.textAlign = 'center';

            for (let i = 0; i < headerRow.cells.length; i++) {
                const cell = this.filterRow.insertCell(i);
                if (Object.values(this.config.filterColumns).includes(i)) {
                    cell.appendChild(this.createFilterSelect(i));
                }
            }
        }


        createFilterSelect(columnIndex) {
            const select = document.createElement('select');
            select.dataset.column = columnIndex;
            select.innerHTML = '<option value="">All</option>';
            select.addEventListener('change', () => this.filterTable());
            select.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent click from bubbling up to header
            });
            return select;
        }

        getUniqueValues(visibleOnly = false) {
            const uniqueValues = {};
            Object.values(this.config.filterColumns).forEach(col => uniqueValues[col] = new Set());

            for (let i = 2; i < this.table.rows.length; i++) {
                const row = this.table.rows[i];
                if (visibleOnly && row.style.display === 'none') continue;

                Object.entries(this.config.filterColumns).forEach(([key, col]) => {
                    const text = row.cells[col]?.innerText.trim() || '';
                    if (text) uniqueValues[col].add(text);
                });
            }
            return uniqueValues;
        }

        populateFilterOptions() {
            const uniqueValues = this.getUniqueValues();
            this.updateSelectOptions(uniqueValues);
        }

        updateSelectOptions(uniqueValues) {
            Object.entries(uniqueValues).forEach(([col, values]) => {
                const select = document.querySelector(`#${this.config.tableId} select[data-column='${col}']`);
                if (!select) return;

                const selectedValue = select.value;
                select.innerHTML = '<option value="">All</option>';

                [...values].sort().forEach(value => {
                    const option = document.createElement('option');
                    option.value = value;
                    option.textContent = value;
                    select.appendChild(option);
                });

                select.value = selectedValue;
            });
        }

        filterTable() {
            const selects = document.querySelectorAll(`#${this.config.tableId} select`);
            const activeFilters = Array.from(selects)
                .filter(select => select.value)
                .map(select => ({
                    column: select.dataset.column,
                    value: select.value
                }));

            // Get all data rows (skip header and filter rows)
            const rows = Array.from(this.table.rows).slice(2);

            let visibleIcaos = [];
            rows.forEach(row => {
                const shouldHide = activeFilters.some(filter =>
                    row.cells[filter.column].innerText.trim() !== filter.value
                );
                row.style.display = shouldHide ? 'none' : '';
                if (!shouldHide) {
                    visibleIcaos.push(row.cells[2].innerText.trim());
                }
            });

            this.updateFilterOptions();
            this.updateAircraftLocationsLink(visibleIcaos, activeFilters.length > 0);
        }


        updateFilterOptions() {
            const uniqueValues = this.getUniqueValues(true);
            this.updateSelectOptions(uniqueValues);
        }

updateAircraftLocationsLink(visibleIcaos, hasFilters) {
    if (!window.location.pathname.includes('/plane-alert/')) return;

    const linkElement = document.querySelector('a[href^="https://globe.adsbexchange.com/?icao="]');
    if (!linkElement) return;

    const listItem = linkElement.closest('li');
    if (!listItem) return;

    // Clear the list item's content first
    listItem.textContent = '';

    // Re-append the link element
    listItem.appendChild(linkElement);

    if (hasFilters) {
        const visibleCount = Math.min(visibleIcaos.length, 250);
        const displayIcaos = visibleIcaos.slice(0, visibleCount);

        linkElement.textContent = `Click here for the locations of the ${visibleCount} unique aircraft currently displayed`;
        linkElement.href = `https://globe.adsbexchange.com/?icao=${displayIcaos.join(',')}`;
    } else {
        linkElement.textContent = "Click here for a map with the current locations of most recent 250 unique aircraft";
    }
}

        setupNumericSorting() {
            const headerRow = this.table.rows[0];

            // Setup sorting for all columns
            Array.from(headerRow.cells).forEach((header, columnIndex) => {
                // Skip sorting for the Icon column (index 1) on plane-alert page
                if (window.location.pathname.includes('/plane-alert/') && columnIndex === 1) {
                    return;
                }

                // Remove any existing click listeners
                const newHeader = header.cloneNode(true);
                header.parentNode.replaceChild(newHeader, header);

                newHeader.addEventListener('click', (e) => {
                    const isAscending = !newHeader.classList.contains('sorted-asc');

                    // Get all rows except header and filter rows
                    const rows = Array.from(this.table.rows).slice(2);

                    rows.sort((a, b) => {
                        if (columnIndex === 0) {
                            // Numeric sorting for first column
                            const aVal = parseInt(a.cells[columnIndex].textContent.trim(), 10);
                            const bVal = parseInt(b.cells[columnIndex].textContent.trim(), 10);
                            return isAscending ? aVal - bVal : bVal - aVal;
                        } else {
                            // Alphabetical sorting for other columns
                            const aVal = a.cells[columnIndex].textContent.trim();
                            const bVal = b.cells[columnIndex].textContent.trim();
                            return isAscending ?
                                aVal.localeCompare(bVal) :
                                bVal.localeCompare(aVal);
                        }
                    });

                    // Remove sort indicators from all headers
                    Array.from(headerRow.cells).forEach(cell => {
                        cell.classList.remove('sorted-asc', 'sorted-desc');
                    });

                    // Update sort direction indicators
                    newHeader.classList.toggle('sorted-asc', isAscending);
                    newHeader.classList.toggle('sorted-desc', !isAscending);

                    // Clear the table body first
                    while (this.table.rows.length > 2) {
                        this.table.deleteRow(2);
                    }

                    // Reinsert rows in new order
                    rows.forEach(row => this.table.appendChild(row));
                });
            });
        }




    }

    // Initialize the table filter when the page loads
    window.addEventListener('load', () => {
        const tableFilter = new TableFilter(CONFIG);
        tableFilter.init();
    });
})();
