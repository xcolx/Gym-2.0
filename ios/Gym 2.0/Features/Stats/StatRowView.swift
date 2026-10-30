//
//  StatRowView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 13.10.2026.
//

import SwiftUI

// One line of a stats summary, e.g. "Total Reps      1234"
struct StatRowView: View {

    let title: String
    let value: String

    init(_ title: String, _ value: String) {
        self.title = title
        self.value = value
    }

    var body: some View {
        HStack{
            Text(title)
            Spacer()
            Text(value)
        }
        .padding(.vertical, 2)
    }
}
